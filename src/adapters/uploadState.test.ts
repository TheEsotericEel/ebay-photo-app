import { describe, expect, it } from 'vitest'
import { getBatchUploadStateSummary, getCleanupReport } from './uploadState'
import type { ItemPacket } from './itemPacket'
import type { StoredPhoto } from './localPhotoStore'

function makeItem(overrides: Partial<ItemPacket> = {}): ItemPacket {
  return {
    id: `item-${Math.random()}`,
    storeId: 'store-a',
    batchId: 'batch-a',
    itemNumber: 1,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    status: 'complete',
    photoIds: ['photo-1'],
    listingStatus: 'new',
    uploadStatus: 'local',
    ...overrides,
  }
}

function makePhoto(overrides: Partial<StoredPhoto> = {}): StoredPhoto {
  const blob = new Blob(['test'], { type: 'image/jpeg' })
  return {
    id: `photo-${Math.random()}`,
    blob,
    mimeType: 'image/jpeg',
    size: blob.size,
    capturedAt: '2026-05-18T00:00:00.000Z',
    savedAt: '2026-05-18T00:00:00.000Z',
    uploadStatus: 'local',
    remoteStatus: 'not_uploaded',
    ...overrides,
  }
}

describe('uploadState', () => {
  it('summarizes upload progress for a batch', () => {
    const items = [
      makeItem({ photoIds: ['photo-1', 'photo-2'] }),
    ]
    const photos = [
      makePhoto({ id: 'photo-1', uploadStatus: 'verified', remoteStatus: 'verified' }),
      makePhoto({ id: 'photo-2', uploadStatus: 'failed', remoteStatus: 'failed' }),
    ]

    const summary = getBatchUploadStateSummary(items, photos, 'store-a', 'batch-a')

    expect(summary.totalItems).toBe(1)
    expect(summary.totalPhotos).toBe(2)
    expect(summary.verifiedPhotos).toBe(1)
    expect(summary.failedPhotos).toBe(1)
    expect(summary.pendingPhotos).toBe(0)
  })

  it('marks cleanup safe only when all photos are verified', () => {
    const items = [makeItem()]
    const photos = [makePhoto({ id: 'photo-1', uploadStatus: 'verified', remoteStatus: 'verified' })]

    const report = getCleanupReport(items, photos, 'store-a', 'batch-a')

    expect(report.safeToClear).toBe(true)
    expect(report.eligiblePhotos).toBe(1)
    expect(report.blockedPhotos).toBe(0)
  })

  it('reports blocked cleanup reasons', () => {
    const items = [makeItem()]
    const photos = [makePhoto({ id: 'photo-1', uploadStatus: 'failed', remoteStatus: 'failed' })]

    const report = getCleanupReport(items, photos, 'store-a', 'batch-a')

    expect(report.safeToClear).toBe(false)
    expect(report.blockedPhotos).toBe(1)
    expect(report.issues[0]).toEqual({ reason: 'failed upload', count: 1 })
  })
})
