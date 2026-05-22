import { describe, expect, it, vi } from 'vitest'
import { deleteEligibleRemotePhotos, getRemoteCleanupReport } from './remoteCleanup'
import type { ItemPacket } from './itemPacket'
import type { StoredPhoto } from './localPhotoStore'
import type { BatchRecord } from './workflowStore'

function makeItem(overrides: Partial<ItemPacket> = {}): ItemPacket {
  return {
    id: 'item-1',
    storeId: 'store-1',
    batchId: 'batch-1',
    itemNumber: 1,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    status: 'complete',
    photoIds: ['photo-1'],
    listingStatus: 'listed',
    uploadStatus: 'verified',
    remoteStatus: 'verified',
    listedAt: '2026-05-10T00:00:00.000Z',
    remoteDeleteEligibleAt: '2026-05-10T00:00:00.000Z',
    remoteExpiresAt: '2026-05-17T00:00:00.000Z',
    ...overrides,
  }
}

function makePhoto(overrides: Partial<StoredPhoto> = {}): StoredPhoto {
  const blob = new Blob(['test'], { type: 'image/jpeg' })
  return {
    id: 'photo-1',
    remoteId: 'remote-photo-1',
    blob,
    mimeType: 'image/jpeg',
    size: blob.size,
    capturedAt: '2026-05-18T00:00:00.000Z',
    savedAt: '2026-05-18T00:00:00.000Z',
    uploadStatus: 'verified',
    remoteStatus: 'verified',
    remoteDeleteEligibleAt: '2026-05-10T00:00:00.000Z',
    remoteExpiresAt: '2026-05-17T00:00:00.000Z',
    localStatus: 'safe_to_clear',
    ...overrides,
  }
}

function makeBatch(overrides: Partial<BatchRecord> = {}): BatchRecord {
  return {
    id: 'batch-1',
    storeId: 'store-1',
    name: 'Batch 1',
    status: 'active',
    remoteRetentionMode: 'delete_7d_after_listed',
    uploadStatus: 'uploaded',
    itemCount: 1,
    photoCount: 1,
    uploadCompletedAt: '2026-05-18T00:00:00.000Z',
    localCleanupCompletedAt: null,
    remoteExpiresAt: '2026-05-17T00:00:00.000Z',
    remoteDeletedAt: null,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('remoteCleanup', () => {
  it('reports a listed and expired photo as eligible', () => {
    const report = getRemoteCleanupReport([makeItem()], [makePhoto()], makeBatch(), 'store-1', 'batch-1')
    expect(report.eligiblePhotos).toBe(1)
    expect(report.blockedPhotos).toBe(0)
  })

  it('blocks cleanup when the item is not listed', () => {
    const report = getRemoteCleanupReport(
      [makeItem({ listingStatus: 'new', listedAt: undefined, remoteDeleteEligibleAt: undefined, remoteExpiresAt: undefined })],
      [makePhoto({ remoteDeleteEligibleAt: undefined, remoteExpiresAt: undefined })],
      makeBatch(),
      'store-1',
      'batch-1',
    )

    expect(report.eligiblePhotos).toBe(0)
    expect(report.issues[0]).toEqual({ reason: 'not listed', count: 1 })
  })

  it('blocks cleanup when a verified photo is missing remote id', () => {
    const report = getRemoteCleanupReport(
      [makeItem()],
      [makePhoto({ remoteId: undefined })],
      makeBatch(),
      'store-1',
      'batch-1',
    )

    expect(report.eligiblePhotos).toBe(0)
    expect(report.blockedPhotos).toBe(1)
    expect(report.issues).toEqual([{ reason: 'missing remote id', count: 1 }])
  })

  it('uses remote photo ids for remote cleanup operations', async () => {
    const item = makeItem({ photoIds: ['local-photo-1'] })
    const photo = makePhoto({
      id: 'local-photo-1',
      remoteId: 'remote-photo-1',
      remoteStatus: 'verified',
      uploadStatus: 'verified',
      localStatus: 'safe_to_clear',
    })
    const batch = makeBatch()

    const localPhotoById = new Map<string, StoredPhoto>([[photo.id, photo]])
    const inMock = vi.fn(async () => ({
      data: [
        {
          photo_id: 'remote-photo-1',
          storage_bucket: 'photo-assets',
          storage_key: 'store-1/batches/batch-1/items/item-1/photos/remote-photo-1/listing',
          variant_type: 'listing',
        },
      ],
      error: null,
    }))
    const variantEqMock = vi.fn(async () => ({ error: null }))
    const photoEqMock = vi.fn(async () => ({ error: null }))

    const client = {
      from: (table: string) => {
        if (table === 'photo_variants') {
          return {
            select: () => ({ in: inMock }),
            update: () => ({ eq: variantEqMock }),
          }
        }
        if (table === 'photos') {
          return {
            update: () => ({ eq: photoEqMock }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
      storage: {
        from: () => ({
          remove: async () => ({ error: null }),
        }),
      },
    }

    const itemStore = {
      updateItem: vi.fn(async () => undefined),
    }
    const photoStore = {
      updatePhoto: vi.fn(async (id: string, patch: Partial<StoredPhoto>) => {
        const current = localPhotoById.get(id)
        if (!current) return
        localPhotoById.set(id, { ...current, ...patch })
      }),
      getPhoto: vi.fn(async (id: string) => localPhotoById.get(id) || null),
    }

    await deleteEligibleRemotePhotos({
      client: client as never,
      batch,
      items: [item],
      photos: [photo],
      itemStore: itemStore as never,
      photoStore: photoStore as never,
      bucket: 'photo-assets',
    })

    expect(inMock).toHaveBeenCalledWith('photo_id', ['remote-photo-1'])
    expect(variantEqMock).toHaveBeenCalledWith('photo_id', 'remote-photo-1')
    expect(photoEqMock).toHaveBeenCalledWith('id', 'remote-photo-1')
    expect(photoStore.updatePhoto).toHaveBeenCalledWith(
      'local-photo-1',
      expect.objectContaining({ remoteStatus: 'deleted' }),
    )
  })
})
