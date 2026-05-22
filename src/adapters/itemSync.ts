import type { SupabaseClient } from '@supabase/supabase-js'
import { IndexedDbItemPacketStore, type ItemPacket } from './itemPacket'
import { IndexedDbWorkflowStore, type BatchItemMutation, type BatchRecord } from './workflowStore'

const CLIENT_ID_KEY = 'ebay-photo-app-client-id'

function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return uuid
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getClientId(): string {
  if (typeof globalThis.localStorage === 'undefined') {
    return 'client-no-storage'
  }

  const existing = globalThis.localStorage.getItem(CLIENT_ID_KEY)
  if (existing) {
    return existing
  }

  const created = makeId('client')
  globalThis.localStorage.setItem(CLIENT_ID_KEY, created)
  return created
}

function toRemoteItemPatch(item: ItemPacket, patch: BatchItemMutation['patch']) {
  const nextListingStatus = patch.listingStatus ?? item.listingStatus ?? 'new'
  const listedAt = patch.listedAt !== undefined
    ? patch.listedAt
    : (nextListingStatus === 'listed' ? (patch.listedAt ?? item.listedAt ?? null) : null)
  const retentionUntil = patch.remoteExpiresAt !== undefined
    ? patch.remoteExpiresAt
    : (nextListingStatus === 'listed' ? (item.remoteExpiresAt ?? null) : null)

  return {
    status: nextListingStatus,
    listed_at: listedAt,
    photo_retention_until: retentionUntil,
    sku: patch.sku !== undefined ? patch.sku : (item.sku ?? null),
    notes: patch.note !== undefined ? patch.note : (item.note ?? null),
    weight: patch.weight !== undefined ? patch.weight : (item.weight ?? null),
    dimensions: patch.dimensions !== undefined ? patch.dimensions : (item.dimensions ?? null),
  }
}

async function savePendingMutations(
  workflowStore: IndexedDbWorkflowStore,
  batch: BatchRecord,
  mutations: BatchItemMutation[],
): Promise<void> {
  await workflowStore.updateBatch(batch.id, {
    pendingItemMutations: mutations,
  })
}

export async function enqueueItemMutation(options: {
  workflowStore: IndexedDbWorkflowStore
  batchId: string
  mutation: BatchItemMutation
}): Promise<void> {
  const { workflowStore, batchId, mutation } = options
  const batch = await workflowStore.getBatch(batchId)
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`)
  }

  const pending = batch.pendingItemMutations || []
  await savePendingMutations(workflowStore, batch, [...pending, mutation])
}

export interface FlushItemMutationsSummary {
  flushed: number
  remaining: number
  errors: string[]
}

export async function flushItemMutations(options: {
  client: SupabaseClient
  workflowStore: IndexedDbWorkflowStore
  itemStore: IndexedDbItemPacketStore
  batchId: string
}): Promise<FlushItemMutationsSummary> {
  const { client, workflowStore, itemStore, batchId } = options
  const batch = await workflowStore.getBatch(batchId)
  if (!batch) {
    return { flushed: 0, remaining: 0, errors: [`Batch ${batchId} not found`] }
  }

  const pending = batch.pendingItemMutations || []
  if (pending.length === 0) {
    return { flushed: 0, remaining: 0, errors: [] }
  }

  const keep: BatchItemMutation[] = []
  const errors: string[] = []
  let flushed = 0

  for (const mutation of pending) {
    const item = await itemStore.getItem(mutation.itemId)
    if (!item) {
      errors.push(`Drop mutation ${mutation.id}: item ${mutation.itemId} missing locally`)
      continue
    }

    const remoteItemId = mutation.remoteItemId || item.remoteId
    if (!remoteItemId) {
      keep.push(mutation)
      continue
    }

    const remotePatch = toRemoteItemPatch(item, mutation.patch)
    const { error } = await client
      .from('items')
      .update(remotePatch)
      .eq('id', remoteItemId)

    if (error) {
      keep.push(mutation)
      errors.push(`Mutation ${mutation.id} failed: ${error.message}`)
      continue
    }

    const syncedAt = new Date().toISOString()
    await itemStore.updateItem(item.id, {
      remoteUpdatedAt: syncedAt,
      remoteId: remoteItemId,
      listingStatus: mutation.patch.listingStatus ?? item.listingStatus,
      listedAt: mutation.patch.listedAt !== undefined ? (mutation.patch.listedAt || undefined) : item.listedAt,
      remoteDeleteEligibleAt: mutation.patch.remoteDeleteEligibleAt !== undefined
        ? (mutation.patch.remoteDeleteEligibleAt || undefined)
        : item.remoteDeleteEligibleAt,
      remoteExpiresAt: mutation.patch.remoteExpiresAt !== undefined
        ? (mutation.patch.remoteExpiresAt || undefined)
        : item.remoteExpiresAt,
      sku: mutation.patch.sku !== undefined ? (mutation.patch.sku || undefined) : item.sku,
      note: mutation.patch.note !== undefined ? (mutation.patch.note || undefined) : item.note,
      weight: mutation.patch.weight !== undefined ? (mutation.patch.weight || undefined) : item.weight,
      dimensions: mutation.patch.dimensions !== undefined ? (mutation.patch.dimensions || undefined) : item.dimensions,
    }).catch(() => undefined)

    flushed += 1
  }

  await savePendingMutations(workflowStore, batch, keep)
  return {
    flushed,
    remaining: keep.length,
    errors,
  }
}

export function createItemMutation(input: {
  clientId: string
  item: ItemPacket
  patch: BatchItemMutation['patch']
}): BatchItemMutation {
  const { clientId, item, patch } = input
  return {
    id: makeId('mutation'),
    clientId,
    itemId: item.id,
    remoteItemId: item.remoteId,
    createdAt: new Date().toISOString(),
    baseRemoteUpdatedAt: item.remoteUpdatedAt,
    patch,
  }
}
