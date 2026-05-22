import type { SupabaseClient } from '@supabase/supabase-js'
import { IndexedDbItemPacketStore, ItemPacket, ListingStatus } from './itemPacket'
import { IndexedDbPhotoStore, StoredPhoto } from './localPhotoStore'
import { BatchRecord, IndexedDbWorkflowStore, StoreRecord } from './workflowStore'

type RemoteItemStatus = 'new' | 'listed' | 'hold' | 'needs_retake'
type RemotePhotoUploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed'
type RemotePhotoStatus = 'not_uploaded' | 'uploaded' | 'verified' | 'delete_eligible' | 'deleting' | 'deleted' | 'failed'

interface RemoteStoreRow {
  id: string
}

interface RemoteBatchRow {
  id: string
  remote_retention_mode?: BatchRecord['remoteRetentionMode'] | null
}

interface RemoteWorkspaceStoreRow {
  id: string
  name: string
  short_code: string
  created_at: string
  updated_at: string
}

interface RemoteWorkspaceBatchRow {
  id: string
  store_id: string
  name: string
  status: BatchRecord['status']
  remote_retention_mode?: BatchRecord['remoteRetentionMode'] | null
  created_at: string
  updated_at: string
}

interface RemoteItemRow {
  id: string
  sequence: number
  status: RemoteItemStatus
  sku: string | null
  notes: string | null
  weight: string | null
  dimensions: string | null
  listed_at: string | null
  photo_retention_until: string | null
  photos_cleaned_at: string | null
  created_at: string
  updated_at: string
}

interface RemotePhotoRow {
  id: string
  item_id: string
  order_index: number
  captured_at: string
  upload_status: RemotePhotoUploadStatus
  remote_status: RemotePhotoStatus
  local_status: StoredPhoto['localStatus']
  remote_delete_eligible_at: string | null
  remote_expires_at: string | null
  remote_deleted_at: string | null
}

interface RemoteVariantRow {
  photo_id: string
  variant_type: 'thumbnail' | 'listing'
  storage_bucket: string
  storage_key: string
  width: number | null
  height: number | null
  bytes: number | null
  mime_type: string | null
}

export interface RemoteImportSummary {
  importedItems: number
  updatedItems: number
  skippedItems: number
  importedPhotos: number
  conflicts: number
  errors: string[]
  latestRemoteUpdatedAt?: string
}

export interface RemoteWorkspaceSyncSummary {
  importedStores: number
  importedBatches: number
  importedItems: number
  updatedItems: number
  skippedItems: number
  importedPhotos: number
  conflicts: number
  errors: string[]
}

export interface RemoteWorkspacePushSummary {
  pushedStores: number
  pushedBatches: number
  errors: string[]
}

export interface RemoteImportOptions {
  client: SupabaseClient
  store: StoreRecord
  batch: BatchRecord
  localItems: ItemPacket[]
  localPhotos: StoredPhoto[]
  workflowStore: IndexedDbWorkflowStore
  itemStore: IndexedDbItemPacketStore
  photoStore: IndexedDbPhotoStore
  sinceUpdatedAt?: string
  upsertExisting?: boolean
}

export interface RemoteWorkspaceSyncOptions {
  client: SupabaseClient
  workflowStore: IndexedDbWorkflowStore
  itemStore: IndexedDbItemPacketStore
  photoStore: IndexedDbPhotoStore
}

export interface RemoteWorkspacePushOptions {
  client: SupabaseClient
  workflowStore: IndexedDbWorkflowStore
}

function mapListingStatus(status: string | null | undefined): ListingStatus {
  if (status === 'listed' || status === 'hold' || status === 'needs_retake') {
    return status
  }
  return 'new'
}

function mapPhotoUploadStatus(status: string | null | undefined): StoredPhoto['uploadStatus'] {
  if (status === 'uploading' || status === 'uploaded' || status === 'failed') {
    return status
  }
  return 'local'
}

function mapPhotoRemoteStatus(status: string | null | undefined): StoredPhoto['remoteStatus'] {
  if (
    status === 'uploaded'
    || status === 'verified'
    || status === 'delete_eligible'
    || status === 'deleting'
    || status === 'deleted'
    || status === 'failed'
  ) {
    return status
  }
  return 'not_uploaded'
}

function makeLocalId(prefix: string, remoteId: string, usedIds: Set<string>): string {
  const base = `${prefix}-import-${remoteId}`
  if (!usedIds.has(base)) {
    usedIds.add(base)
    return base
  }

  let suffix = 1
  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1
  }
  const id = `${base}-${suffix}`
  usedIds.add(id)
  return id
}

function deriveItemStatuses(itemPhotos: RemotePhotoRow[]): Pick<ItemPacket, 'uploadStatus' | 'remoteStatus'> {
  if (itemPhotos.length === 0) {
    return {
      uploadStatus: 'local',
      remoteStatus: 'local',
    }
  }

  if (itemPhotos.some((photo) => photo.upload_status === 'failed' || photo.remote_status === 'failed')) {
    return {
      uploadStatus: 'failed',
      remoteStatus: 'failed',
    }
  }

  const allVerifiedOrDeleted = itemPhotos.every((photo) => photo.remote_status === 'verified' || photo.remote_status === 'deleted')
  if (allVerifiedOrDeleted) {
    return {
      uploadStatus: 'verified',
      remoteStatus: 'verified',
    }
  }

  const allUploadedLike = itemPhotos.every((photo) => (
    photo.upload_status === 'uploaded'
    || photo.remote_status === 'uploaded'
    || photo.remote_status === 'verified'
    || photo.remote_status === 'deleted'
  ))
  if (allUploadedLike) {
    return {
      uploadStatus: 'uploaded',
      remoteStatus: 'uploaded',
    }
  }

  if (itemPhotos.some((photo) => photo.upload_status === 'uploading' || photo.remote_status === 'deleting')) {
    return {
      uploadStatus: 'uploading',
      remoteStatus: 'uploading',
    }
  }

  return {
    uploadStatus: 'queued',
    remoteStatus: 'queued',
  }
}

async function downloadPreferredVariant(
  client: SupabaseClient,
  photo: RemotePhotoRow,
  variantsByPhotoId: Map<string, RemoteVariantRow[]>,
): Promise<{ blob: Blob; variant: RemoteVariantRow | null; error: string | null }> {
  const variants = variantsByPhotoId.get(photo.id) || []
  const thumbnail = variants.find((variant) => variant.variant_type === 'thumbnail')
  const listingFallback = variants.find((variant) => variant.variant_type === 'listing')
  const preferred = thumbnail || listingFallback || null

  if (!preferred) {
    return {
      blob: new Blob([]),
      variant: null,
      error: `Photo ${photo.id} has no thumbnail/listing variant`,
    }
  }

  const { data, error } = await client
    .storage
    .from(preferred.storage_bucket)
    .download(preferred.storage_key)

  if (error || !data) {
    return {
      blob: new Blob([]),
      variant: preferred,
      error: `Photo ${photo.id} variant download failed: ${error?.message || 'missing data'}`,
    }
  }

  return {
    blob: data,
    variant: preferred,
    error: null,
  }
}

export async function importRemoteBatchToLocal(options: RemoteImportOptions): Promise<RemoteImportSummary> {
  const summary: RemoteImportSummary = {
    importedItems: 0,
    updatedItems: 0,
    skippedItems: 0,
    importedPhotos: 0,
    conflicts: 0,
    errors: [],
    latestRemoteUpdatedAt: options.sinceUpdatedAt,
  }

  const {
    client,
    store,
    batch,
    localItems,
    localPhotos,
    workflowStore,
    itemStore,
    photoStore,
    sinceUpdatedAt,
    upsertExisting = false,
  } = options

  const { data: remoteStore, error: storeError } = await client
    .from('stores')
    .select('id')
    .eq('short_code', store.shortCode)
    .maybeSingle<RemoteStoreRow>()

  if (storeError) {
    summary.errors.push(`Resolve remote store failed: ${storeError.message}`)
    return summary
  }
  if (!remoteStore?.id) {
    summary.errors.push(`Remote store not found for short code ${store.shortCode}`)
    return summary
  }

  await workflowStore.updateStore(store.id, { remoteId: remoteStore.id }).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error)
    summary.errors.push(`Local store linkage update failed: ${msg}`)
  })

  const { data: remoteBatch, error: batchError } = await client
    .from('batches')
    .select('id, remote_retention_mode')
    .eq('store_id', remoteStore.id)
    .eq('name', batch.name)
    .maybeSingle<RemoteBatchRow>()

  if (batchError) {
    summary.errors.push(`Resolve remote batch failed: ${batchError.message}`)
    return summary
  }
  if (!remoteBatch?.id) {
    summary.errors.push(`Remote batch not found for ${store.shortCode} / ${batch.name}`)
    return summary
  }

  await workflowStore.updateBatch(batch.id, {
    remoteId: remoteBatch.id,
    remoteRetentionMode: remoteBatch.remote_retention_mode || batch.remoteRetentionMode,
  }).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error)
    summary.errors.push(`Local batch linkage update failed: ${msg}`)
  })

  let remoteItemsQuery = client
    .from('items')
    .select('id, sequence, status, sku, notes, weight, dimensions, listed_at, photo_retention_until, photos_cleaned_at, created_at, updated_at')
    .eq('batch_id', remoteBatch.id)
    .order('sequence', { ascending: true })

  if (sinceUpdatedAt) {
    remoteItemsQuery = remoteItemsQuery.gt('updated_at', sinceUpdatedAt)
  }

  const { data: remoteItems, error: itemsError } = await remoteItemsQuery
    .returns<RemoteItemRow[]>()

  if (itemsError) {
    summary.errors.push(`Fetch remote items failed: ${itemsError.message}`)
    return summary
  }

  if (!remoteItems || remoteItems.length === 0) {
    return summary
  }

  const remoteItemIds = remoteItems.map((item) => item.id)
  const { data: remotePhotos, error: photosError } = await client
    .from('photos')
    .select('id, item_id, order_index, captured_at, upload_status, remote_status, local_status, remote_delete_eligible_at, remote_expires_at, remote_deleted_at')
    .in('item_id', remoteItemIds)
    .order('order_index', { ascending: true })
    .returns<RemotePhotoRow[]>()

  if (photosError) {
    summary.errors.push(`Fetch remote photos failed: ${photosError.message}`)
    return summary
  }

  const remotePhotoIds = (remotePhotos || []).map((photo) => photo.id)
  let remoteVariants: RemoteVariantRow[] = []
  if (remotePhotoIds.length > 0) {
    const { data, error } = await client
      .from('photo_variants')
      .select('photo_id, variant_type, storage_bucket, storage_key, width, height, bytes, mime_type')
      .in('photo_id', remotePhotoIds)
      .in('variant_type', ['thumbnail', 'listing'])
      .returns<RemoteVariantRow[]>()

    if (error) {
      summary.errors.push(`Fetch remote variants failed: ${error.message}`)
      return summary
    }
    remoteVariants = data || []
  }

  const photosByItemId = new Map<string, RemotePhotoRow[]>()
  for (const photo of remotePhotos || []) {
    const current = photosByItemId.get(photo.item_id) || []
    current.push(photo)
    photosByItemId.set(photo.item_id, current)
  }
  for (const [itemId, itemPhotos] of photosByItemId.entries()) {
    itemPhotos.sort((a, b) => a.order_index - b.order_index)
    photosByItemId.set(itemId, itemPhotos)
  }

  const variantsByPhotoId = new Map<string, RemoteVariantRow[]>()
  for (const variant of remoteVariants) {
    const current = variantsByPhotoId.get(variant.photo_id) || []
    current.push(variant)
    variantsByPhotoId.set(variant.photo_id, current)
  }

  const localItemByRemoteId = new Map(localItems.filter((item) => item.remoteId).map((item) => [item.remoteId as string, item]))
  const localPhotoByRemoteId = new Map(localPhotos.filter((photo) => photo.remoteId).map((photo) => [photo.remoteId as string, photo]))
  const localItemIds = new Set(localItems.map((item) => item.id))
  const localPhotoIds = new Set(localPhotos.map((photo) => photo.id))

  for (const remoteItem of remoteItems) {
    const existingLocalItem = localItemByRemoteId.get(remoteItem.id)

    if (existingLocalItem && !upsertExisting) {
      summary.skippedItems += 1
      continue
    }

    const hasLocalConflict = localItems.some((item) => (
      item.storeId === store.id
      && item.batchId === batch.id
      && item.itemNumber === remoteItem.sequence
      && !item.remoteId
    ))
    if (hasLocalConflict) {
      summary.conflicts += 1
      continue
    }

    const itemPhotos = photosByItemId.get(remoteItem.id) || []
    const itemLocalPhotoIds: string[] = []

    for (const remotePhoto of itemPhotos) {
      const existingLocalPhoto = localPhotoByRemoteId.get(remotePhoto.id)
      if (existingLocalPhoto) {
        itemLocalPhotoIds.push(existingLocalPhoto.id)
        continue
      }

      const download = await downloadPreferredVariant(client, remotePhoto, variantsByPhotoId)
      if (download.error) {
        summary.errors.push(download.error)
      }

      const blob = download.blob
      const mimeType = download.variant?.mime_type || blob.type || 'image/jpeg'
      const localPhotoId = makeLocalId('photo', remotePhoto.id, localPhotoIds)
      const uploadedAt = remotePhoto.captured_at || new Date().toISOString()
      const storedPhotoInput: Omit<StoredPhoto, 'savedAt'> = {
        id: localPhotoId,
        remoteId: remotePhoto.id,
        blob,
        mimeType,
        size: blob.size,
        capturedAt: uploadedAt,
        uploadStatus: mapPhotoUploadStatus(remotePhoto.upload_status),
        remoteStatus: mapPhotoRemoteStatus(remotePhoto.remote_status),
        localStatus: 'missing',
        remoteDeleteEligibleAt: remotePhoto.remote_delete_eligible_at || undefined,
        remoteExpiresAt: remotePhoto.remote_expires_at || undefined,
        remoteDeletedAt: remotePhoto.remote_deleted_at || undefined,
        thumbnailBlob: blob,
        thumbnailSize: blob.size,
        thumbnailWidth: download.variant?.width || undefined,
        thumbnailHeight: download.variant?.height || undefined,
        outputWidth: download.variant?.width || undefined,
        outputHeight: download.variant?.height || undefined,
      }

      try {
        const savedPhoto = await photoStore.save(storedPhotoInput)
        localPhotoByRemoteId.set(remotePhoto.id, savedPhoto)
        itemLocalPhotoIds.push(savedPhoto.id)
        summary.importedPhotos += 1
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        summary.errors.push(`Local photo save failed (${remotePhoto.id}): ${msg}`)
      }
    }

    const localItemId = existingLocalItem?.id || makeLocalId('item', remoteItem.id, localItemIds)
    const derivedStatuses = deriveItemStatuses(itemPhotos)
    const item: ItemPacket = {
      id: localItemId,
      remoteId: remoteItem.id,
      storeId: store.id,
      batchId: batch.id,
      itemNumber: remoteItem.sequence,
      createdAt: existingLocalItem?.createdAt || remoteItem.created_at,
      updatedAt: remoteItem.updated_at || new Date().toISOString(),
      status: itemLocalPhotoIds.length > 0 ? 'complete' : (existingLocalItem?.status || 'draft'),
      photoIds: itemLocalPhotoIds.length > 0 ? itemLocalPhotoIds : (existingLocalItem?.photoIds || []),
      listingStatus: mapListingStatus(remoteItem.status),
      uploadStatus: derivedStatuses.uploadStatus,
      remoteStatus: derivedStatuses.remoteStatus,
      remoteUpdatedAt: remoteItem.updated_at || undefined,
      listedAt: remoteItem.listed_at || undefined,
      remoteExpiresAt: remoteItem.photo_retention_until || undefined,
      remoteDeletedAt: remoteItem.photos_cleaned_at || undefined,
      sku: remoteItem.sku || undefined,
      note: remoteItem.notes || undefined,
      weight: remoteItem.weight || undefined,
      dimensions: remoteItem.dimensions || undefined,
    }

    try {
      await itemStore.upsertItem(item)
      localItemByRemoteId.set(remoteItem.id, item)
      if (existingLocalItem) {
        summary.updatedItems += 1
      } else {
        summary.importedItems += 1
      }
      if (remoteItem.updated_at && (!summary.latestRemoteUpdatedAt || remoteItem.updated_at > summary.latestRemoteUpdatedAt)) {
        summary.latestRemoteUpdatedAt = remoteItem.updated_at
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      summary.errors.push(`Local item save failed (${remoteItem.id}): ${msg}`)
    }
  }

  return summary
}

export async function syncRemoteBatchDeltaToLocal(
  options: Omit<RemoteImportOptions, 'localItems' | 'localPhotos' | 'sinceUpdatedAt' | 'upsertExisting'>,
): Promise<RemoteImportSummary> {
  const { workflowStore, itemStore, photoStore, batch } = options
  const localItems = await itemStore.getAllItems()
  const localPhotos = await photoStore.getAll()
  const summary = await importRemoteBatchToLocal({
    ...options,
    localItems,
    localPhotos,
    sinceUpdatedAt: batch.itemSyncCursor,
    upsertExisting: true,
  })

  if (summary.latestRemoteUpdatedAt && summary.latestRemoteUpdatedAt !== batch.itemSyncCursor) {
    await workflowStore.updateBatch(batch.id, { itemSyncCursor: summary.latestRemoteUpdatedAt })
  }

  return summary
}

async function resolveLocalStoreForRemote(
  workflowStore: IndexedDbWorkflowStore,
  remoteStore: RemoteWorkspaceStoreRow,
): Promise<{ store: StoreRecord; created: boolean }> {
  const localStores = await workflowStore.getAllStores()
  const existing = localStores.find((store) => store.remoteId === remoteStore.id || store.shortCode === remoteStore.short_code)

  if (existing) {
    await workflowStore.upsertStore({
      ...existing,
      remoteId: remoteStore.id,
      name: remoteStore.name,
      shortCode: remoteStore.short_code,
      updatedAt: remoteStore.updated_at || new Date().toISOString(),
    })

    const updated = await workflowStore.getStore(existing.id)
    return {
      store: updated ?? {
        ...existing,
        remoteId: remoteStore.id,
        name: remoteStore.name,
        shortCode: remoteStore.short_code,
        updatedAt: remoteStore.updated_at || existing.updatedAt,
      },
      created: false,
    }
  }

  const created = await workflowStore.createStore(remoteStore.name, remoteStore.short_code)
  await workflowStore.upsertStore({
    ...created,
    remoteId: remoteStore.id,
    updatedAt: remoteStore.updated_at || created.updatedAt,
  })

  const linked = await workflowStore.getStore(created.id)
  return {
    store: linked ?? {
      ...created,
      remoteId: remoteStore.id,
      updatedAt: remoteStore.updated_at || created.updatedAt,
    },
    created: true,
  }
}

async function resolveLocalBatchForRemote(
  workflowStore: IndexedDbWorkflowStore,
  store: StoreRecord,
  remoteBatch: RemoteWorkspaceBatchRow,
): Promise<{ batch: BatchRecord; created: boolean }> {
  const localBatches = await workflowStore.getBatches(store.id)
  const existing = localBatches.find((batch) => batch.remoteId === remoteBatch.id || batch.name === remoteBatch.name)

  if (existing) {
    await workflowStore.upsertBatch({
      ...existing,
      remoteId: remoteBatch.id,
      name: remoteBatch.name,
      status: remoteBatch.status,
      remoteRetentionMode: remoteBatch.remote_retention_mode || existing.remoteRetentionMode,
      updatedAt: remoteBatch.updated_at || new Date().toISOString(),
    })

    const updated = await workflowStore.getBatch(existing.id)
    return {
      batch: updated ?? {
        ...existing,
        remoteId: remoteBatch.id,
        name: remoteBatch.name,
        status: remoteBatch.status,
        remoteRetentionMode: remoteBatch.remote_retention_mode || existing.remoteRetentionMode,
        updatedAt: remoteBatch.updated_at || existing.updatedAt,
      },
      created: false,
    }
  }

  const created = await workflowStore.createBatch(store.id, remoteBatch.name)
  await workflowStore.upsertBatch({
    ...created,
    remoteId: remoteBatch.id,
    status: remoteBatch.status,
    remoteRetentionMode: remoteBatch.remote_retention_mode || created.remoteRetentionMode,
    updatedAt: remoteBatch.updated_at || created.updatedAt,
  })

  const linked = await workflowStore.getBatch(created.id)
  return {
    batch: linked ?? {
      ...created,
      remoteId: remoteBatch.id,
      status: remoteBatch.status,
      remoteRetentionMode: remoteBatch.remote_retention_mode || created.remoteRetentionMode,
      updatedAt: remoteBatch.updated_at || created.updatedAt,
    },
    created: true,
  }
}

async function persistLocalStoreLink(
  workflowStore: IndexedDbWorkflowStore,
  store: StoreRecord,
  remoteId: string,
): Promise<StoreRecord> {
  const linked: StoreRecord = {
    ...store,
    remoteId,
    updatedAt: new Date().toISOString(),
  }
  await workflowStore.upsertStore(linked)
  return linked
}

async function persistLocalBatchLink(
  workflowStore: IndexedDbWorkflowStore,
  batch: BatchRecord,
  remoteId: string,
  remoteRetentionMode?: BatchRecord['remoteRetentionMode'] | null,
): Promise<BatchRecord> {
  const linked: BatchRecord = {
    ...batch,
    remoteId,
    remoteRetentionMode: remoteRetentionMode || batch.remoteRetentionMode,
    updatedAt: new Date().toISOString(),
  }
  await workflowStore.upsertBatch(linked)
  return linked
}

async function resolveRemoteStoreForLocal(
  client: SupabaseClient,
  workflowStore: IndexedDbWorkflowStore,
  store: StoreRecord,
): Promise<{ remoteId: string; store: StoreRecord; created: boolean }> {
  const remoteId = store.remoteId
  if (remoteId) {
    const { data, error } = await client
      .from('stores')
      .update({
        name: store.name,
        short_code: store.shortCode,
      })
      .eq('id', remoteId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }
    if (data?.id) {
      return {
        remoteId: data.id as string,
        store: await persistLocalStoreLink(workflowStore, store, data.id as string),
        created: false,
      }
    }
  }

  const { data: existing, error: existingError } = await client
    .from('stores')
    .select('id')
    .eq('short_code', store.shortCode)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    const { data, error } = await client
      .from('stores')
      .update({
        name: store.name,
        short_code: store.shortCode,
      })
      .eq('id', existing.id as string)
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }
    if (data?.id) {
      return {
        remoteId: data.id as string,
        store: await persistLocalStoreLink(workflowStore, store, data.id as string),
        created: false,
      }
    }
  }

  const createdId = globalThis.crypto?.randomUUID?.() || `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await client
    .from('stores')
    .insert({
      id: createdId,
      name: store.name,
      short_code: store.shortCode,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return {
    remoteId: data.id as string,
    store: await persistLocalStoreLink(workflowStore, store, data.id as string),
    created: true,
  }
}

async function resolveRemoteBatchForLocal(
  client: SupabaseClient,
  workflowStore: IndexedDbWorkflowStore,
  storeRemoteId: string,
  batch: BatchRecord,
): Promise<{ remoteId: string; batch: BatchRecord; created: boolean }> {
  const remoteId = batch.remoteId
  if (remoteId) {
    const { data, error } = await client
      .from('batches')
      .update({
        store_id: storeRemoteId,
        name: batch.name,
        status: batch.status,
        remote_retention_mode: batch.remoteRetentionMode || 'delete_7d_after_listed',
      })
      .eq('id', remoteId)
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }
    if (data?.id) {
      return {
        remoteId: data.id as string,
        batch: await persistLocalBatchLink(workflowStore, batch, data.id as string, batch.remoteRetentionMode),
        created: false,
      }
    }
  }

  const { data: existing, error: existingError } = await client
    .from('batches')
    .select('id')
    .eq('store_id', storeRemoteId)
    .eq('name', batch.name)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing?.id) {
    const { data, error } = await client
      .from('batches')
      .update({
        store_id: storeRemoteId,
        name: batch.name,
        status: batch.status,
        remote_retention_mode: batch.remoteRetentionMode || 'delete_7d_after_listed',
      })
      .eq('id', existing.id as string)
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }
    if (data?.id) {
      return {
        remoteId: data.id as string,
        batch: await persistLocalBatchLink(workflowStore, batch, data.id as string, batch.remoteRetentionMode),
        created: false,
      }
    }
  }

  const createdId = globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await client
    .from('batches')
    .insert({
      id: createdId,
      store_id: storeRemoteId,
      name: batch.name,
      status: batch.status,
      upload_status: batch.uploadStatus || 'local',
      remote_retention_mode: batch.remoteRetentionMode || 'delete_7d_after_listed',
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return {
    remoteId: data.id as string,
    batch: await persistLocalBatchLink(workflowStore, batch, data.id as string, batch.remoteRetentionMode),
    created: true,
  }
}

export async function syncLocalWorkspaceToRemote(
  options: RemoteWorkspacePushOptions,
): Promise<RemoteWorkspacePushSummary> {
  const summary: RemoteWorkspacePushSummary = {
    pushedStores: 0,
    pushedBatches: 0,
    errors: [],
  }

  const { client, workflowStore } = options
  const localStores = await workflowStore.getAllStores()

  for (const store of localStores) {
    try {
      const remoteStore = await resolveRemoteStoreForLocal(client, workflowStore, store)
      if (remoteStore.created) {
        summary.pushedStores += 1
      }

      const localBatches = await workflowStore.getBatches(store.id)
      for (const batch of localBatches) {
        const remoteBatch = await resolveRemoteBatchForLocal(
          client,
          workflowStore,
          remoteStore.remoteId,
          batch,
        )
        if (remoteBatch.created) {
          summary.pushedBatches += 1
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      summary.errors.push(`Workspace push failed for ${store.shortCode}: ${msg}`)
    }
  }

  return summary
}

export async function syncRemoteWorkspaceToLocal(
  options: RemoteWorkspaceSyncOptions,
): Promise<RemoteWorkspaceSyncSummary> {
  const summary: RemoteWorkspaceSyncSummary = {
    importedStores: 0,
    importedBatches: 0,
    importedItems: 0,
    updatedItems: 0,
    skippedItems: 0,
    importedPhotos: 0,
    conflicts: 0,
    errors: [],
  }

  const { client, workflowStore, itemStore, photoStore } = options

  const { data: remoteStores, error: storesError } = await client
    .from('stores')
    .select('id, name, short_code, created_at, updated_at')
    .returns<RemoteWorkspaceStoreRow[]>()

  if (storesError) {
    summary.errors.push(`Fetch remote stores failed: ${storesError.message}`)
    return summary
  }

  if (!remoteStores || remoteStores.length === 0) {
    summary.errors.push('No remote stores found in Supabase.')
    return summary
  }

  for (const remoteStore of remoteStores) {
    const localStore = await resolveLocalStoreForRemote(workflowStore, remoteStore)
    if (localStore.created) {
      summary.importedStores += 1
    }

    const { data: remoteBatches, error: batchesError } = await client
      .from('batches')
      .select('id, store_id, name, status, remote_retention_mode, created_at, updated_at')
      .eq('store_id', remoteStore.id)
      .returns<RemoteWorkspaceBatchRow[]>()

    if (batchesError) {
      summary.errors.push(`Fetch remote batches failed for ${remoteStore.short_code}: ${batchesError.message}`)
      continue
    }

    for (const remoteBatch of remoteBatches || []) {
      const localBatch = await resolveLocalBatchForRemote(workflowStore, localStore.store, remoteBatch)
      if (localBatch.created) {
        summary.importedBatches += 1
      }

      const localItems = await itemStore.getAllItems()
      const localPhotos = await photoStore.getAll()
      const batchImport = await importRemoteBatchToLocal({
        client,
        store: localStore.store,
        batch: localBatch.batch,
        localItems,
        localPhotos,
        workflowStore,
        itemStore,
        photoStore,
      })

      summary.importedItems += batchImport.importedItems
      summary.updatedItems += batchImport.updatedItems
      summary.skippedItems += batchImport.skippedItems
      summary.importedPhotos += batchImport.importedPhotos
      summary.conflicts += batchImport.conflicts
      summary.errors.push(...batchImport.errors)
    }
  }

  return summary
}
