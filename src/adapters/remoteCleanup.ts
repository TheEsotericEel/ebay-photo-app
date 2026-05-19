import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_STORAGE_BUCKET } from '../lib/appConfig'
import { calculateRetentionWindow, isRetentionExpired, RemoteRetentionMode } from './retention'
import { IndexedDbItemPacketStore, ItemPacket } from './itemPacket'
import { IndexedDbPhotoStore, StoredPhoto } from './localPhotoStore'
import { BatchRecord } from './workflowStore'

export interface CleanupIssue {
  reason: string
  count: number
}

export interface RemoteCleanupReport {
  totalPhotos: number
  eligiblePhotos: number
  blockedPhotos: number
  skippedPhotos: number
  issues: CleanupIssue[]
  nextEligibleAt: string | null
}

export interface RemoteCleanupProgress {
  stage: 'collecting' | 'deleting_objects' | 'updating_records' | 'complete' | 'error'
  message: string
  photoIndex?: number
  photoCount?: number
  photoId?: string
}

export interface RemoteCleanupSummary {
  deletedPhotos: number
  skippedPhotos: number
  blockedPhotos: number
}

export interface RemoteCleanupOptions {
  client: SupabaseClient
  batch: BatchRecord
  items: ItemPacket[]
  photos: StoredPhoto[]
  itemStore: IndexedDbItemPacketStore
  photoStore: IndexedDbPhotoStore
  bucket?: string
  onProgress?: (progress: RemoteCleanupProgress) => void
}

interface VariantRow {
  photo_id: string
  storage_bucket: string
  storage_key: string
  variant_type: string
}

function countIssues(reasons: string[]): CleanupIssue[] {
  const counts = new Map<string, number>()
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1)
  }

  return [...counts.entries()].map(([reason, count]) => ({ reason, count }))
}

function nowIso(): string {
  return new Date().toISOString()
}

function getRelevantPhotos(items: ItemPacket[], photos: StoredPhoto[], storeId: string, batchId: string): Array<{ item: ItemPacket; photo: StoredPhoto }> {
  const relevantItems = items.filter((item) => item.storeId === storeId && item.batchId === batchId)
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]))

  const result: Array<{ item: ItemPacket; photo: StoredPhoto }> = []
  for (const item of relevantItems) {
    for (const photoId of item.photoIds) {
      const photo = photoMap.get(photoId)
      if (photo) {
        result.push({ item, photo })
      }
    }
  }

  return result
}

export function getRemoteCleanupReport(
  items: ItemPacket[],
  photos: StoredPhoto[],
  batch: BatchRecord,
  storeId: string,
  batchId: string,
): RemoteCleanupReport {
  const relevant = getRelevantPhotos(items, photos, storeId, batchId)
  const issues: string[] = []
  let eligiblePhotos = 0
  let blockedPhotos = 0
  let skippedPhotos = 0
  let nextEligibleAt: string | null = null

  for (const { item, photo } of relevant) {
    if (photo.remoteStatus === 'deleted') {
      skippedPhotos += 1
      continue
    }

    if (item.listingStatus !== 'listed') {
      issues.push('not listed')
      blockedPhotos += 1
      continue
    }

    const window = calculateRetentionWindow(item.listedAt, batch.remoteRetentionMode as RemoteRetentionMode | undefined)
    const eligibleAt = photo.remoteDeleteEligibleAt || window.eligibleAt
    const expiresAt = photo.remoteExpiresAt || window.expiresAt

    if (!eligibleAt) {
      issues.push('retention date missing')
      blockedPhotos += 1
      continue
    }

    if (!isRetentionExpired(expiresAt, new Date())) {
      issues.push('retention window active')
      blockedPhotos += 1
      if (!nextEligibleAt || new Date(eligibleAt).getTime() < new Date(nextEligibleAt).getTime()) {
        nextEligibleAt = eligibleAt
      }
      continue
    }

    if (photo.uploadStatus !== 'verified' || photo.remoteStatus !== 'verified') {
      issues.push('remote upload not verified')
      blockedPhotos += 1
      continue
    }

    eligiblePhotos += 1
  }

  return {
    totalPhotos: relevant.length,
    eligiblePhotos,
    blockedPhotos,
    skippedPhotos,
    issues: countIssues(issues),
    nextEligibleAt,
  }
}

export async function deleteEligibleRemotePhotos({
  client,
  batch,
  items,
  photos,
  itemStore,
  photoStore,
  bucket = SUPABASE_STORAGE_BUCKET,
  onProgress,
}: RemoteCleanupOptions): Promise<RemoteCleanupSummary> {
  const relevant = getRelevantPhotos(items, photos, batch.storeId, batch.id)
  const eligible = relevant.filter(({ item, photo }) => {
    if (item.listingStatus !== 'listed') return false
    if (photo.remoteStatus !== 'verified' || photo.uploadStatus !== 'verified') return false
    const window = calculateRetentionWindow(item.listedAt, batch.remoteRetentionMode as RemoteRetentionMode | undefined)
    const expiresAt = photo.remoteExpiresAt || window.expiresAt
    return isRetentionExpired(expiresAt, new Date())
  })

  let deletedPhotos = 0
  let skippedPhotos = relevant.filter(({ photo }) => photo.remoteStatus === 'deleted').length
  let blockedPhotos = relevant.length - eligible.length - skippedPhotos

  if (eligible.length === 0) {
    return { deletedPhotos, skippedPhotos, blockedPhotos }
  }

  onProgress?.({
    stage: 'collecting',
    message: `Preparing remote cleanup for ${eligible.length} photo${eligible.length === 1 ? '' : 's'}`,
    photoCount: eligible.length,
  })

  const eligiblePhotoIds = eligible.map(({ photo }) => photo.id)
  const { data: variantRows, error: variantsError } = await client
    .from('photo_variants')
    .select('photo_id, storage_bucket, storage_key, variant_type')
    .in('photo_id', eligiblePhotoIds)

  if (variantsError) {
    throw variantsError
  }

  const rowsByPhotoId = new Map<string, VariantRow[]>()
  for (const row of (variantRows || []) as VariantRow[]) {
    if (!rowsByPhotoId.has(row.photo_id)) {
      rowsByPhotoId.set(row.photo_id, [])
    }
    rowsByPhotoId.get(row.photo_id)!.push(row)
  }

  for (let index = 0; index < eligible.length; index += 1) {
    const { item, photo } = eligible[index]
    const photoRows = rowsByPhotoId.get(photo.id) || []
    const keysToRemove = photoRows
      .filter((row) => row.storage_bucket === bucket)
      .map((row) => row.storage_key)

    onProgress?.({
      stage: 'deleting_objects',
      message: `Deleting remote assets for Item ${item.itemNumber}`,
      photoIndex: index + 1,
      photoCount: eligible.length,
      photoId: photo.id,
    })

    if (keysToRemove.length > 0) {
      const { error: removeError } = await client.storage.from(bucket).remove(keysToRemove)
      if (removeError) {
        throw removeError
      }
    }

    const deletedAt = nowIso()

    const { error: variantsUpdateError } = await client
      .from('photo_variants')
      .update({ remote_deleted_at: deletedAt })
      .eq('photo_id', photo.id)

    if (variantsUpdateError) {
      throw variantsUpdateError
    }

    const { error: photoUpdateError } = await client
      .from('photos')
      .update({
        remote_status: 'deleted',
        remote_deleted_at: deletedAt,
        local_status: photo.localStatus || 'safe_to_clear',
      })
      .eq('id', photo.id)

    if (photoUpdateError) {
      throw photoUpdateError
    }

    await photoStore.updatePhoto(photo.id, {
      remoteStatus: 'deleted',
      remoteDeletedAt: deletedAt,
      localStatus: photo.localStatus === 'cleared' ? 'cleared' : 'safe_to_clear',
    })

    const currentItemPhotos = await Promise.all(
      item.photoIds.map(async (photoId) => photoStore.getPhoto(photoId)),
    )
    if (currentItemPhotos.every((entry) => entry?.remoteStatus === 'deleted')) {
      await itemStore.updateItem(item.id, {
        remoteDeletedAt: deletedAt,
      })
    }

    deletedPhotos += 1
  }

  onProgress?.({
    stage: 'complete',
    message: `Deleted ${deletedPhotos} remote photo${deletedPhotos === 1 ? '' : 's'}`,
    photoCount: eligible.length,
  })

  return {
    deletedPhotos,
    skippedPhotos,
    blockedPhotos,
  }
}
