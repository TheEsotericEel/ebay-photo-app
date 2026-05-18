import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_STORAGE_BUCKET } from '../lib/appConfig'
import { IndexedDbItemPacketStore, ItemPacket } from './itemPacket'
import { IndexedDbPhotoStore, StoredPhoto } from './localPhotoStore'
import { BatchRecord, StoreRecord } from './workflowStore'
import { calculateRetentionWindow } from './retention'

export type BatchUploadStage =
  | 'idle'
  | 'resolving_store'
  | 'resolving_batch'
  | 'uploading_item'
  | 'uploading_photo'
  | 'finalizing'
  | 'complete'
  | 'error'

export interface BatchUploadProgress {
  stage: BatchUploadStage
  message: string
  itemIndex?: number
  itemCount?: number
  photoIndex?: number
  photoCount?: number
  itemId?: string
  photoId?: string
}

export interface BatchUploadSummary {
  storeId: string
  batchId: string
  uploadedItems: number
  failedItems: number
  uploadedPhotos: number
  failedPhotos: number
  skippedItems: number
  skippedPhotos: number
}

export interface BatchUploadOptions {
  client: SupabaseClient
  store: StoreRecord
  batch: BatchRecord
  items: ItemPacket[]
  photos: StoredPhoto[]
  itemStore: IndexedDbItemPacketStore
  photoStore: IndexedDbPhotoStore
  bucket?: string
  onProgress?: (progress: BatchUploadProgress) => void
}

interface RemoteReference {
  id: string
}

function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function storageBasePath(storeShortCode: string, batchId: string, itemId: string, photoId: string): string {
  return `${storeShortCode}/batches/${batchId}/items/${itemId}/photos/${photoId}`
}

async function resolveRemoteStore(
  client: SupabaseClient,
  store: StoreRecord,
): Promise<RemoteReference> {
  const { data: existing, error: existingError } = await client
    .from('stores')
    .select('id')
    .eq('short_code', store.shortCode)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    return { id: existing.id as string }
  }

  const remoteId = makeId('store')
  const { data, error } = await client
    .from('stores')
    .insert({
      id: remoteId,
      name: store.name,
      short_code: store.shortCode,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return { id: data.id as string }
}

async function resolveRemoteBatch(
  client: SupabaseClient,
  storeId: string,
  batch: BatchRecord,
): Promise<RemoteReference> {
  const { data: existing, error: existingError } = await client
    .from('batches')
    .select('id')
    .eq('store_id', storeId)
    .eq('name', batch.name)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    return { id: existing.id as string }
  }

  const remoteId = makeId('batch')
  const { data, error } = await client
    .from('batches')
    .insert({
      id: remoteId,
      store_id: storeId,
      name: batch.name,
      status: batch.status,
      upload_status: 'local',
      remote_retention_mode: 'delete_7d_after_listed',
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return { id: data.id as string }
}

async function resolveRemoteItem(
  client: SupabaseClient,
  storeId: string,
  batchId: string,
  item: ItemPacket,
): Promise<RemoteReference> {
  const { data: existing, error: existingError } = await client
    .from('items')
    .select('id')
    .eq('batch_id', batchId)
    .eq('sequence', item.itemNumber)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  const remoteId = item.remoteId || existing?.id || makeId('item')
  const { data, error } = await client
    .from('items')
        .upsert(
          {
            id: remoteId,
            store_id: storeId,
            batch_id: batchId,
            sequence: item.itemNumber,
            status: item.listingStatus || 'new',
            sku: item.sku || null,
            notes: item.note || null,
            weight: item.weight || null,
            dimensions: item.dimensions || null,
            listing_intent: 'unknown',
            tags: [],
          },
      { onConflict: 'batch_id,sequence' },
    )
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return { id: data.id as string }
}

async function uploadPhotoVariants(
  client: SupabaseClient,
  bucket: string,
  remoteStoreId: string,
  remoteBatchId: string,
  remoteItemId: string,
  localPhoto: StoredPhoto,
  remotePhotoId: string,
): Promise<void> {
  const basePath = storageBasePath(remoteStoreId, remoteBatchId, remoteItemId, remotePhotoId)
  const originalBlob = localPhoto.originalBlob || localPhoto.blob
  const originalMimeType = localPhoto.originalMimeType || localPhoto.mimeType
  const listingBlob = localPhoto.blob
  const listingMimeType = localPhoto.mimeType
  const thumbnailBlob = localPhoto.thumbnailBlob || localPhoto.blob
  const thumbnailMimeType = localPhoto.mimeType
  const timestamp = nowIso()

  const uploads = [
    {
      variant: 'original' as const,
      blob: originalBlob,
      mimeType: originalMimeType,
      storageKey: `${basePath}/original`,
      width: localPhoto.originalWidth || localPhoto.outputWidth || null,
      height: localPhoto.originalHeight || localPhoto.outputHeight || null,
      bytes: localPhoto.originalSize || originalBlob.size,
    },
    {
      variant: 'listing' as const,
      blob: listingBlob,
      mimeType: listingMimeType,
      storageKey: `${basePath}/listing`,
      width: localPhoto.outputWidth || null,
      height: localPhoto.outputHeight || null,
      bytes: localPhoto.size,
    },
    {
      variant: 'thumbnail' as const,
      blob: thumbnailBlob,
      mimeType: thumbnailMimeType,
      storageKey: `${basePath}/thumbnail`,
      width: localPhoto.thumbnailWidth || localPhoto.outputWidth || null,
      height: localPhoto.thumbnailHeight || localPhoto.outputHeight || null,
      bytes: localPhoto.thumbnailSize || thumbnailBlob.size,
    },
  ]

  for (const upload of uploads) {
    const { error: storageError } = await client.storage
      .from(bucket)
      .upload(upload.storageKey, upload.blob, {
        contentType: upload.mimeType,
        upsert: true,
      })

    if (storageError) {
      throw storageError
    }

    const { error: variantError } = await client
      .from('photo_variants')
      .upsert(
        {
          photo_id: remotePhotoId,
          variant_type: upload.variant,
          storage_bucket: bucket,
          storage_key: upload.storageKey,
          width: upload.width,
          height: upload.height,
          bytes: upload.bytes,
          mime_type: upload.mimeType,
          uploaded_at: timestamp,
          verified_at: timestamp,
        },
        { onConflict: 'photo_id,variant_type' },
      )

    if (variantError) {
      throw variantError
    }
  }
}

export async function syncBatchToSupabase(options: BatchUploadOptions): Promise<BatchUploadSummary> {
  const {
    client,
    store,
    batch,
    items,
    photos,
    itemStore,
    photoStore,
    bucket = SUPABASE_STORAGE_BUCKET,
    onProgress,
  } = options

  const relevantItems = items
    .filter((item) => item.storeId === store.id && item.batchId === batch.id)
    .filter((item) => item.photoIds.length > 0)

  let uploadedItems = 0
  let failedItems = 0
  let uploadedPhotos = 0
  let failedPhotos = 0
  let skippedItems = 0
  let skippedPhotos = 0

  onProgress?.({
    stage: 'resolving_store',
    message: `Resolving remote store for ${store.name}`,
    itemCount: relevantItems.length,
  })
  const remoteStore = await resolveRemoteStore(client, store)

  onProgress?.({
    stage: 'resolving_batch',
    message: `Resolving remote batch ${batch.name}`,
    itemCount: relevantItems.length,
  })
  const remoteBatch = await resolveRemoteBatch(client, remoteStore.id, batch)

  for (let index = 0; index < relevantItems.length; index += 1) {
    const item = relevantItems[index]
    const itemPhotos = item.photoIds
      .map((photoId) => photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is StoredPhoto => Boolean(photo))

    if (itemPhotos.length === 0) {
      skippedItems += 1
      continue
    }

    try {
      onProgress?.({
        stage: 'uploading_item',
        message: `Uploading Item ${item.itemNumber}`,
        itemIndex: index + 1,
        itemCount: relevantItems.length,
        itemId: item.id,
      })

      const remoteItem = await resolveRemoteItem(client, remoteStore.id, remoteBatch.id, item)
      const remotePhotoIdByLocalId = new Map<string, string>()
      const pendingPhotos = itemPhotos.filter((photo) => photo.uploadStatus !== 'verified' || photo.remoteStatus !== 'verified')
      const retentionWindow = calculateRetentionWindow(item.listedAt, batch.remoteRetentionMode)

      await itemStore.updateItem(item.id, {
        remoteId: remoteItem.id,
        uploadStatus: 'uploading',
        remoteStatus: 'uploading',
        remoteUpdatedAt: nowIso(),
      })

      if (pendingPhotos.length === 0) {
        const itemFinalizedAt = nowIso()
        const { error: itemFinalizeError } = await client
          .from('items')
          .update({
            main_photo_id: remotePhotoIdByLocalId.get(itemPhotos[0]?.id || '') || itemPhotos[0]?.remoteId || null,
            status: item.listingStatus || 'new',
            sku: item.sku || null,
            notes: item.note || null,
            weight: item.weight || null,
            dimensions: item.dimensions || null,
            listed_at: item.listingStatus === 'listed' ? (item.listedAt || itemFinalizedAt) : null,
            photo_retention_until: item.listingStatus === 'listed' ? retentionWindow.expiresAt : null,
          })
          .eq('id', remoteItem.id)

        if (itemFinalizeError) {
          throw itemFinalizeError
        }

        await itemStore.updateItem(item.id, {
          remoteId: remoteItem.id,
          uploadStatus: 'verified',
          remoteStatus: 'verified',
          remoteUpdatedAt: itemFinalizedAt,
          remoteDeleteEligibleAt: item.listingStatus === 'listed' ? retentionWindow.eligibleAt || undefined : undefined,
          remoteExpiresAt: item.listingStatus === 'listed' ? retentionWindow.expiresAt || undefined : undefined,
        })

        uploadedItems += 1
        uploadedPhotos += itemPhotos.length
        continue
      }

      for (let photoIndex = 0; photoIndex < itemPhotos.length; photoIndex += 1) {
        const localPhoto = itemPhotos[photoIndex]
        const alreadyVerified = localPhoto.uploadStatus === 'verified' && localPhoto.remoteStatus === 'verified'
        if (alreadyVerified) {
          skippedPhotos += 1
          const existingRemoteId = localPhoto.remoteId || makeId('photo')
          remotePhotoIdByLocalId.set(localPhoto.id, existingRemoteId)
          continue
        }

        const remotePhotoId = localPhoto.remoteId || makeId('photo')
        remotePhotoIdByLocalId.set(localPhoto.id, remotePhotoId)

        onProgress?.({
          stage: 'uploading_photo',
          message: `Uploading Item ${item.itemNumber} photo ${photoIndex + 1}/${itemPhotos.length}`,
          itemIndex: index + 1,
          itemCount: relevantItems.length,
          photoIndex: photoIndex + 1,
          photoCount: itemPhotos.length,
          itemId: item.id,
          photoId: localPhoto.id,
        })

        await photoStore.updatePhoto(localPhoto.id, {
          remoteId: remotePhotoId,
          uploadStatus: 'uploading',
          remoteStatus: 'not_uploaded',
        })

        const { data: existingPhotoRow } = await client
          .from('photos')
          .select('upload_attempt_count')
          .eq('id', remotePhotoId)
          .maybeSingle()
        const nextAttemptCount = (existingPhotoRow?.upload_attempt_count || 0) + 1

        const { error: photoInsertError } = await client
          .from('photos')
          .upsert(
            {
              id: remotePhotoId,
              store_id: remoteStore.id,
              batch_id: remoteBatch.id,
              item_id: remoteItem.id,
              order_index: photoIndex,
              local_status: 'present',
              upload_status: 'uploading',
              remote_status: 'not_uploaded',
              captured_at: localPhoto.capturedAt,
              upload_attempt_count: nextAttemptCount,
              remote_delete_eligible_at: item.listingStatus === 'listed' ? retentionWindow.eligibleAt : null,
              remote_expires_at: item.listingStatus === 'listed' ? retentionWindow.expiresAt : null,
            },
            { onConflict: 'id' },
          )

        if (photoInsertError) {
          throw photoInsertError
        }

        await uploadPhotoVariants(client, bucket, remoteStore.id, remoteBatch.id, remoteItem.id, localPhoto, remotePhotoId)

        const finalizedAt = nowIso()
        const { error: photoFinalizeError } = await client
          .from('photos')
          .update({
            upload_status: 'uploaded',
            remote_status: 'verified',
            remote_verified_at: finalizedAt,
            local_status: 'safe_to_clear',
            remote_delete_eligible_at: item.listingStatus === 'listed' ? retentionWindow.eligibleAt : null,
            remote_expires_at: item.listingStatus === 'listed' ? retentionWindow.expiresAt : null,
          })
          .eq('id', remotePhotoId)

        if (photoFinalizeError) {
          throw photoFinalizeError
        }

        await photoStore.updatePhoto(localPhoto.id, {
          uploadStatus: 'verified',
          remoteStatus: 'verified',
          remoteDeleteEligibleAt: item.listingStatus === 'listed' ? retentionWindow.eligibleAt || undefined : undefined,
          remoteExpiresAt: item.listingStatus === 'listed' ? retentionWindow.expiresAt || undefined : undefined,
        })
      }

      const mainRemotePhotoId = remotePhotoIdByLocalId.get(itemPhotos[0].id) || null
      const itemFinalizedAt = nowIso()
      const { error: itemFinalizeError } = await client
        .from('items')
        .update({
          main_photo_id: mainRemotePhotoId,
          status: item.listingStatus || 'new',
          sku: item.sku || null,
          notes: item.note || null,
          weight: item.weight || null,
          dimensions: item.dimensions || null,
          listed_at: item.listingStatus === 'listed' ? (item.listedAt || itemFinalizedAt) : null,
          photo_retention_until: item.listingStatus === 'listed' ? retentionWindow.expiresAt : null,
        })
        .eq('id', remoteItem.id)

      if (itemFinalizeError) {
        throw itemFinalizeError
      }

      await itemStore.updateItem(item.id, {
        remoteId: remoteItem.id,
        uploadStatus: 'uploaded',
        remoteStatus: 'verified',
        remoteUpdatedAt: itemFinalizedAt,
        remoteDeleteEligibleAt: item.listingStatus === 'listed' ? retentionWindow.eligibleAt || undefined : undefined,
        remoteExpiresAt: item.listingStatus === 'listed' ? retentionWindow.expiresAt || undefined : undefined,
      })

      uploadedItems += 1
      uploadedPhotos += itemPhotos.length
    } catch (err) {
      failedItems += 1
      failedPhotos += itemPhotos.length
      const message = err instanceof Error ? err.message : String(err)
      onProgress?.({
        stage: 'error',
        message: `Item ${item.itemNumber} failed: ${message}`,
        itemIndex: index + 1,
        itemCount: relevantItems.length,
        itemId: item.id,
      })

      await itemStore.updateItem(item.id, {
        uploadStatus: 'failed',
        remoteStatus: 'failed',
        remoteUpdatedAt: nowIso(),
      }).catch(() => undefined)

      for (const localPhoto of itemPhotos) {
        await photoStore.updatePhoto(localPhoto.id, {
          uploadStatus: 'failed',
          remoteStatus: 'failed',
        }).catch(() => undefined)
      }
    }
  }

  const finalStatus = failedItems > 0 ? 'partial' : 'uploaded'
  const finalTimestamp = nowIso()
  await client
    .from('batches')
    .update({
      item_count: items.filter((item) => item.storeId === store.id && item.batchId === batch.id).length,
      photo_count: photos.filter((photo) => items.some((item) => item.photoIds.includes(photo.id) && item.storeId === store.id && item.batchId === batch.id)).length,
      upload_status: finalStatus,
      upload_completed_at: failedItems > 0 ? null : finalTimestamp,
      remote_expires_at: items
        .filter((item) => item.storeId === store.id && item.batchId === batch.id && item.listingStatus === 'listed' && item.remoteExpiresAt)
        .map((item) => item.remoteExpiresAt as string)
        .sort()[0] || null,
    })
    .eq('id', remoteBatch.id)

  onProgress?.({
    stage: 'complete',
    message: failedItems > 0
      ? `Sync finished with ${failedItems} item failure${failedItems === 1 ? '' : 's'}`
      : `Synced ${uploadedItems} item${uploadedItems === 1 ? '' : 's'} to Supabase`,
    itemCount: relevantItems.length,
  })

  return {
    storeId: remoteStore.id,
    batchId: remoteBatch.id,
    uploadedItems,
    failedItems,
    uploadedPhotos,
    failedPhotos,
    skippedItems,
    skippedPhotos,
  }
}
