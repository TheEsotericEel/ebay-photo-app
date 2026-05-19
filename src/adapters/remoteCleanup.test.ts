import { describe, expect, it } from 'vitest'
import { getRemoteCleanupReport } from './remoteCleanup'
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
})
