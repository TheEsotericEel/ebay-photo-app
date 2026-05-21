import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_VERSION } from './dbConfig'
import { IndexedDbItemPacketStore } from './itemPacket'
import { IndexedDbPhotoStore } from './localPhotoStore'
import { IndexedDbWorkflowStore } from './workflowStore'
import { syncRemoteWorkspaceToLocal } from './remoteImport'

const REMOTE_STORE_ID = '11111111-1111-1111-1111-111111111111'
const REMOTE_BATCH_ID = '22222222-2222-2222-2222-222222222222'
const REMOTE_ITEM_ID = '33333333-3333-3333-3333-333333333333'
const REMOTE_PHOTO_ID = '44444444-4444-4444-4444-444444444444'

function makePhotoBlob(): Blob {
  return new Blob([Uint8Array.from([255, 216, 255, 217])], { type: 'image/jpeg' })
}

function createMockClient() {
  const remoteStore = {
    id: REMOTE_STORE_ID,
    name: 'Remote Store',
    short_code: 'RST',
    created_at: '2026-05-21T12:00:00.000Z',
    updated_at: '2026-05-21T12:00:00.000Z',
  }

  const remoteBatch = {
    id: REMOTE_BATCH_ID,
    store_id: REMOTE_STORE_ID,
    name: 'Batch Alpha',
    status: 'active' as const,
    remote_retention_mode: 'delete_7d_after_listed' as const,
    created_at: '2026-05-21T12:00:00.000Z',
    updated_at: '2026-05-21T12:00:00.000Z',
  }

  const remoteItem = {
    id: REMOTE_ITEM_ID,
    sequence: 1,
    status: 'new',
    sku: 'SKU-REMOTE',
    notes: 'Imported from Supabase',
    weight: '1 lb',
    dimensions: '10x10',
    listed_at: null,
    photo_retention_until: null,
    photos_cleaned_at: null,
    created_at: '2026-05-21T12:00:00.000Z',
    updated_at: '2026-05-21T12:00:00.000Z',
  }

  const remotePhoto = {
    id: REMOTE_PHOTO_ID,
    item_id: REMOTE_ITEM_ID,
    order_index: 0,
    captured_at: '2026-05-21T12:00:00.000Z',
    upload_status: 'uploaded',
    remote_status: 'uploaded',
    local_status: 'safe_to_clear',
    remote_delete_eligible_at: null,
    remote_expires_at: null,
    remote_deleted_at: null,
  }

  const remoteVariant = {
    photo_id: REMOTE_PHOTO_ID,
    variant_type: 'thumbnail' as const,
    storage_bucket: 'photo-assets',
    storage_key: `${REMOTE_STORE_ID}/batches/${REMOTE_BATCH_ID}/items/${REMOTE_ITEM_ID}/photos/${REMOTE_PHOTO_ID}/thumbnail`,
    width: 480,
    height: 480,
    bytes: 128,
    mime_type: 'image/jpeg',
  }

  let storeShortCodeFilter: string | null = null
  let batchStoreIdFilter: string | null = null
  let batchNameFilter: string | null = null
  let itemBatchIdFilter: string | null = null
  let photoIdFilter: string[] = []
  let variantPhotoIds: string[] = []

  const storesQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'short_code') {
        storeShortCodeFilter = value
      }
      return storesQuery
    }),
    returns: vi.fn(async () => ({
      data: [remoteStore],
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data: storeShortCodeFilter === remoteStore.short_code ? remoteStore : null,
      error: null,
    })),
  }

  const batchesQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'store_id') {
        batchStoreIdFilter = value
      }
      if (column === 'name') {
        batchNameFilter = value
      }
      return batchesQuery
    }),
    returns: vi.fn(async () => ({
      data: batchStoreIdFilter === remoteStore.id ? [remoteBatch] : [],
      error: null,
    })),
    maybeSingle: vi.fn(async () => ({
      data:
        batchStoreIdFilter === remoteStore.id && batchNameFilter === remoteBatch.name
          ? remoteBatch
          : null,
      error: null,
    })),
  }

  const itemsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'batch_id') {
        itemBatchIdFilter = value
      }
      return itemsQuery
    }),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn(async () => ({
      data: itemBatchIdFilter === remoteBatch.id ? [remoteItem] : [],
      error: null,
    })),
  }

  const photosQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((column: string, values: string[]) => {
      if (column === 'item_id') {
        photoIdFilter = values
      }
      return photosQuery
    }),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn(async () => ({
      data: photoIdFilter.includes(remoteItem.id) ? [remotePhoto] : [],
      error: null,
    })),
  }

  const variantsQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn((column: string, values: string[]) => {
      if (column === 'photo_id') {
        variantPhotoIds = values
      }
      return variantsQuery
    }),
    returns: vi.fn(async () => ({
      data: variantPhotoIds.includes(remotePhoto.id) ? [remoteVariant] : [],
      error: null,
    })),
  }

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'stores':
        return storesQuery
      case 'batches':
        return batchesQuery
      case 'items':
        return itemsQuery
      case 'photos':
        return photosQuery
      case 'photo_variants':
        return variantsQuery
      default:
        throw new Error(`Unexpected table ${table}`)
    }
  })

  const storageFrom = vi.fn(() => ({
    download: vi.fn(async () => ({
      data: makePhotoBlob(),
      error: null,
    })),
  }))

  return {
    from,
    storage: { from: storageFrom },
  }
}

describe('syncRemoteWorkspaceToLocal', () => {
  let workflowStore: IndexedDbWorkflowStore
  let itemStore: IndexedDbItemPacketStore
  let photoStore: IndexedDbPhotoStore

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    const dbName = `remote-workspace-sync-${Date.now()}-${Math.random()}`
    photoStore = new IndexedDbPhotoStore(dbName, DB_VERSION)
    itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
    workflowStore = new IndexedDbWorkflowStore(dbName, DB_VERSION)
  })

  it('bootstraps local stores and imports remote items from Supabase', async () => {
    const summary = await syncRemoteWorkspaceToLocal({
      client: createMockClient() as never,
      workflowStore,
      itemStore,
      photoStore,
    })

    expect(summary.errors).toEqual([])
    expect(summary.importedStores).toBe(1)
    expect(summary.importedBatches).toBe(1)
    expect(summary.importedItems).toBe(1)
    expect(summary.importedPhotos).toBe(1)

    const stores = await workflowStore.getAllStores()
    expect(stores).toHaveLength(1)
    expect(stores[0].remoteId).toBe(REMOTE_STORE_ID)
    expect(stores[0].shortCode).toBe('RST')

    const batches = await workflowStore.getBatches(stores[0].id)
    expect(batches).toHaveLength(1)
    expect(batches[0].remoteId).toBe(REMOTE_BATCH_ID)
    expect(batches[0].name).toBe('Batch Alpha')

    const items = await itemStore.getAllItems()
    expect(items).toHaveLength(1)
    expect(items[0].remoteId).toBe(REMOTE_ITEM_ID)
    expect(items[0].photoIds).toHaveLength(1)

    const photos = await photoStore.getAll()
    expect(photos).toHaveLength(1)
    expect(photos[0].remoteId).toBe(REMOTE_PHOTO_ID)
    expect(photos[0].thumbnailBlob).toBeTruthy()
  })
})
