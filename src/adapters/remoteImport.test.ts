import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_VERSION } from './dbConfig'
import { IndexedDbItemPacketStore } from './itemPacket'
import { IndexedDbPhotoStore } from './localPhotoStore'
import { IndexedDbWorkflowStore } from './workflowStore'
import { importRemoteBatchToLocal } from './remoteImport'

const REMOTE_STORE_ID = '11111111-1111-1111-1111-111111111111'
const REMOTE_BATCH_ID = '22222222-2222-2222-2222-222222222222'
const REMOTE_ITEM_ID = '21f0a8ff-b339-49b5-bbb6-e054527494c1'
const REMOTE_PHOTO_A = 'e4e05977-530a-4117-9db3-2476973b0385'
const REMOTE_PHOTO_B = '35b208b0-aa75-40f8-b138-2084c347a430'

function makeThumbnailBlob(): Blob {
  return new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/jpeg' })
}

function createMockClient() {
  const thumbnailBlob = makeThumbnailBlob()
  const storeQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: REMOTE_STORE_ID }, error: null }),
  }
  const batchQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: REMOTE_BATCH_ID, remote_retention_mode: 'delete_7d_after_listed' },
      error: null,
    }),
  }
  const itemsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({
      data: [
        {
          id: REMOTE_ITEM_ID,
          sequence: 1,
          status: 'new',
          sku: 'SKU-IMPORT',
          notes: 'Imported note',
          weight: '1 lb',
          dimensions: '10x10',
          listed_at: null,
          photo_retention_until: null,
          photos_cleaned_at: null,
          created_at: '2026-05-20T16:54:07.394982+00:00',
          updated_at: '2026-05-20T16:54:07.394982+00:00',
        },
      ],
      error: null,
    }),
  }
  const photosQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({
      data: [
        {
          id: REMOTE_PHOTO_B,
          item_id: REMOTE_ITEM_ID,
          order_index: 1,
          captured_at: '2026-05-20T16:54:10.096225+00:00',
          upload_status: 'uploaded',
          remote_status: 'uploaded',
          local_status: 'safe_to_clear',
          remote_delete_eligible_at: null,
          remote_expires_at: null,
          remote_deleted_at: null,
        },
        {
          id: REMOTE_PHOTO_A,
          item_id: REMOTE_ITEM_ID,
          order_index: 0,
          captured_at: '2026-05-20T16:54:08.74758+00:00',
          upload_status: 'uploaded',
          remote_status: 'uploaded',
          local_status: 'safe_to_clear',
          remote_delete_eligible_at: null,
          remote_expires_at: null,
          remote_deleted_at: null,
        },
      ],
      error: null,
    }),
  }
  const variantsQuery = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({
      data: [
        {
          photo_id: REMOTE_PHOTO_A,
          variant_type: 'thumbnail',
          storage_bucket: 'photo-assets',
          storage_key: `${REMOTE_STORE_ID}/batches/${REMOTE_BATCH_ID}/items/${REMOTE_ITEM_ID}/photos/${REMOTE_PHOTO_A}/thumbnail`,
          width: 480,
          height: 480,
          bytes: 1000,
          mime_type: 'image/jpeg',
        },
        {
          photo_id: REMOTE_PHOTO_B,
          variant_type: 'listing',
          storage_bucket: 'photo-assets',
          storage_key: `${REMOTE_STORE_ID}/batches/${REMOTE_BATCH_ID}/items/${REMOTE_ITEM_ID}/photos/${REMOTE_PHOTO_B}/listing`,
          width: 4800,
          height: 4800,
          bytes: 2000,
          mime_type: 'image/jpeg',
        },
      ],
      error: null,
    }),
  }

  const from = vi.fn((table: string) => {
    switch (table) {
      case 'stores':
        return storeQuery
      case 'batches':
        return batchQuery
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
    download: vi.fn(async (storageKey: string) => ({
      data: thumbnailBlob,
      error: null,
      storageKey,
    })),
  }))

  return {
    from,
    storage: { from: storageFrom },
  }
}

describe('importRemoteBatchToLocal', () => {
  let workflowStore: IndexedDbWorkflowStore
  let itemStore: IndexedDbItemPacketStore
  let photoStore: IndexedDbPhotoStore
  let localStoreId: string
  let localBatchId: string

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    const dbSuffix = `${Date.now()}-${Math.random()}`
    const dbName = `remote-import-db-${dbSuffix}`
    // Open photo/item stores first so the shared DB gets the full schema.
    photoStore = new IndexedDbPhotoStore(dbName, DB_VERSION)
    itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
    workflowStore = new IndexedDbWorkflowStore(dbName, DB_VERSION)

    const store = await workflowStore.ensureDefaultStore()
    const batch = await workflowStore.ensureDefaultBatch(store.id)
    localStoreId = store.id
    localBatchId = batch.id
  })

  it('imports remote item and photos with remote IDs and ordered local photo IDs', async () => {
    const store = {
      ...(await workflowStore.getStore(localStoreId))!,
      shortCode: 'DEF',
    }
    const batch = {
      ...(await workflowStore.getBatch(localBatchId))!,
      name: 'Current Batch',
    }
    await workflowStore.updateStore(store.id, { shortCode: 'DEF' })
    await workflowStore.updateBatch(batch.id, { name: 'Current Batch' })

    const summary = await importRemoteBatchToLocal({
      client: createMockClient() as never,
      store,
      batch,
      localItems: [],
      localPhotos: [],
      workflowStore,
      itemStore,
      photoStore,
    })

    expect(summary.importedItems).toBe(1)
    expect(summary.importedPhotos).toBe(2)
    expect(summary.skippedItems).toBe(0)
    expect(summary.conflicts).toBe(0)
    expect(summary.errors).toEqual([])

    const linkedStore = await workflowStore.getStore(localStoreId)
    const linkedBatch = await workflowStore.getBatch(localBatchId)
    expect(linkedStore?.remoteId).toBe(REMOTE_STORE_ID)
    expect(linkedBatch?.remoteId).toBe(REMOTE_BATCH_ID)

    const items = await itemStore.getAllItems()
    expect(items).toHaveLength(1)
    const importedItem = items[0]
    expect(importedItem.remoteId).toBe(REMOTE_ITEM_ID)
    expect(importedItem.storeId).toBe(localStoreId)
    expect(importedItem.batchId).toBe(localBatchId)
    expect(importedItem.itemNumber).toBe(1)
    expect(importedItem.listingStatus).toBe('new')
    expect(importedItem.status).toBe('complete')
    expect(importedItem.sku).toBe('SKU-IMPORT')
    expect(importedItem.note).toBe('Imported note')
    expect(importedItem.photoIds).toHaveLength(2)

    const photos = await photoStore.getAll()
    expect(photos).toHaveLength(2)
    const photoRemoteIds = photos.map((photo) => photo.remoteId).sort()
    expect(photoRemoteIds).toEqual([REMOTE_PHOTO_A, REMOTE_PHOTO_B].sort())

    const orderedRemoteIds = importedItem.photoIds.map((photoId) => photos.find((photo) => photo.id === photoId)?.remoteId)
    expect(orderedRemoteIds).toEqual([REMOTE_PHOTO_A, REMOTE_PHOTO_B])

    for (const photo of photos) {
      expect(photo.thumbnailBlob).toBeTruthy()
      expect(photo.blob).toBeTruthy()
      expect(photo.localStatus).toBe('missing')
      expect(photo.uploadStatus).toBe('uploaded')
      expect(photo.remoteStatus).toBe('uploaded')
    }
  })

  it('is idempotent on repeated import', async () => {
    const store = {
      ...(await workflowStore.getStore(localStoreId))!,
      shortCode: 'DEF',
    }
    const batch = {
      ...(await workflowStore.getBatch(localBatchId))!,
      name: 'Current Batch',
    }

    const client = createMockClient() as never
    const first = await importRemoteBatchToLocal({
      client,
      store,
      batch,
      localItems: [],
      localPhotos: [],
      workflowStore,
      itemStore,
      photoStore,
    })
    const itemsAfterFirst = await itemStore.getAllItems()
    const photosAfterFirst = await photoStore.getAll()

    const second = await importRemoteBatchToLocal({
      client,
      store,
      batch,
      localItems: itemsAfterFirst,
      localPhotos: photosAfterFirst,
      workflowStore,
      itemStore,
      photoStore,
    })

    expect(first.importedItems).toBe(1)
    expect(second.importedItems).toBe(0)
    expect(second.skippedItems).toBe(1)
    expect(second.importedPhotos).toBe(0)
    expect((await itemStore.getAllItems())).toHaveLength(1)
    expect((await photoStore.getAll())).toHaveLength(2)
  })

  it('reports conflict when local item number exists without remoteId', async () => {
    const store = {
      ...(await workflowStore.getStore(localStoreId))!,
      shortCode: 'DEF',
    }
    const batch = {
      ...(await workflowStore.getBatch(localBatchId))!,
      name: 'Current Batch',
    }

    const conflictingItem = await itemStore.createItem(localStoreId, localBatchId)
    await itemStore.updateItem(conflictingItem.id, { itemNumber: 1 })

    const summary = await importRemoteBatchToLocal({
      client: createMockClient() as never,
      store,
      batch,
      localItems: await itemStore.getAllItems(),
      localPhotos: [],
      workflowStore,
      itemStore,
      photoStore,
    })

    expect(summary.importedItems).toBe(0)
    expect(summary.conflicts).toBe(1)
    expect((await itemStore.getAllItems())).toHaveLength(1)
    expect((await itemStore.getAllItems())[0].remoteId).toBeUndefined()
  })
})
