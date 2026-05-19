import { ItemPacket } from './itemPacket'
import { StoredPhoto } from './localPhotoStore'

export interface BatchUploadStateSummary {
  totalItems: number
  totalPhotos: number
  verifiedPhotos: number
  pendingPhotos: number
  failedPhotos: number
  safeToClearPhotos: number
}

export interface CleanupIssue {
  reason: string
  count: number
}

export interface CleanupReport {
  totalPhotos: number
  eligiblePhotos: number
  blockedPhotos: number
  safeToClear: boolean
  issues: CleanupIssue[]
}

function countIssues(reasons: string[]): CleanupIssue[] {
  const counts = new Map<string, number>()
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1)
  }

  return [...counts.entries()].map(([reason, count]) => ({ reason, count }))
}

export function getBatchUploadStateSummary(
  items: ItemPacket[],
  photos: StoredPhoto[],
  storeId: string,
  batchId: string,
): BatchUploadStateSummary {
  const relevantItems = items.filter((item) => item.storeId === storeId && item.batchId === batchId)
  const relevantPhotoIds = new Set(relevantItems.flatMap((item) => item.photoIds))
  const relevantPhotos = photos.filter((photo) => relevantPhotoIds.has(photo.id))
  const verifiedPhotos = relevantPhotos.filter((photo) => {
    return photo.uploadStatus === 'verified' && ['verified', 'deleted'].includes(photo.remoteStatus || 'local')
  }).length
  const failedPhotos = relevantPhotos.filter((photo) => photo.uploadStatus === 'failed' || photo.remoteStatus === 'failed').length
  const pendingPhotos = relevantPhotos.filter((photo) => !['verified', 'deleted', 'failed'].includes(photo.remoteStatus || photo.uploadStatus || 'local')).length

  return {
    totalItems: relevantItems.length,
    totalPhotos: relevantPhotos.length,
    verifiedPhotos,
    pendingPhotos,
    failedPhotos,
    safeToClearPhotos: verifiedPhotos,
  }
}

export function getCleanupReport(
  items: ItemPacket[],
  photos: StoredPhoto[],
  storeId: string,
  batchId: string,
): CleanupReport {
  const relevantItems = items.filter((item) => item.storeId === storeId && item.batchId === batchId)
  const relevantPhotoIds = new Set(relevantItems.flatMap((item) => item.photoIds))
  const relevantPhotos = photos.filter((photo) => relevantPhotoIds.has(photo.id))

  const eligiblePhotos = relevantPhotos.filter((photo) => photo.uploadStatus === 'verified' && ['verified', 'deleted'].includes(photo.remoteStatus || 'local'))
  const blockedReasons: string[] = []

  for (const photo of relevantPhotos) {
    if (photo.uploadStatus === 'verified' && ['verified', 'deleted'].includes(photo.remoteStatus || 'local')) {
      continue
    }

    if (photo.uploadStatus === 'failed' || photo.remoteStatus === 'failed') {
      blockedReasons.push('failed upload')
      continue
    }

    if (photo.remoteStatus === 'deleted') {
      continue
    }

    if (photo.uploadStatus === 'uploading') {
      blockedReasons.push('uploading')
      continue
    }

    if (photo.uploadStatus === 'queued' || photo.uploadStatus === 'local' || !photo.uploadStatus) {
      blockedReasons.push('not uploaded')
      continue
    }

    blockedReasons.push('remote verification pending')
  }

  const issues = countIssues(blockedReasons)
  const blockedPhotos = blockedReasons.length

  return {
    totalPhotos: relevantPhotos.length,
    eligiblePhotos: eligiblePhotos.length,
    blockedPhotos,
    safeToClear: blockedPhotos === 0 && eligiblePhotos.length > 0,
    issues,
  }
}
