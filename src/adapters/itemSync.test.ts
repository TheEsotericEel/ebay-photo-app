import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_VERSION } from './dbConfig'
import { IndexedDbItemPacketStore } from './itemPacket'
import { createItemMutation, enqueueItemMutation, flushItemMutations } from './itemSync'
import { IndexedDbWorkflowStore } from './workflowStore'

describe('itemSync mutation queue', () => {
  let workflowStore: IndexedDbWorkflowStore
  let itemStore: IndexedDbItemPacketStore

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    const dbName = `item-sync-${Date.now()}-${Math.random()}`
    itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
    workflowStore = new IndexedDbWorkflowStore(dbName, DB_VERSION)
  })

  it('flushes queued item mutation and clears queue on success', async () => {
    const store = await workflowStore.ensureDefaultStore()
    const batch = await workflowStore.ensureDefaultBatch(store.id)
    const item = await itemStore.createItem(store.id, batch.id)
    await itemStore.updateItem(item.id, {
      remoteId: 'remote-item-1',
      status: 'complete',
      listingStatus: 'new',
    })
    const latestItem = (await itemStore.getItem(item.id))!

    const mutation = createItemMutation({
      clientId: 'client-1',
      item: latestItem,
      patch: {
        listingStatus: 'listed',
        listedAt: '2026-05-21T12:00:00.000Z',
        remoteExpiresAt: '2026-05-28T12:00:00.000Z',
      },
    })

    await enqueueItemMutation({
      workflowStore,
      batchId: batch.id,
      mutation,
    })

    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))

    const summary = await flushItemMutations({
      client: { from } as never,
      workflowStore,
      itemStore,
      batchId: batch.id,
    })

    expect(summary.errors).toEqual([])
    expect(summary.flushed).toBe(1)
    expect(summary.remaining).toBe(0)
    expect(from).toHaveBeenCalledWith('items')
    expect(update).toHaveBeenCalledTimes(1)
    expect(eq).toHaveBeenCalledWith('id', 'remote-item-1')

    const updatedBatch = await workflowStore.getBatch(batch.id)
    expect(updatedBatch?.pendingItemMutations || []).toHaveLength(0)
  })
})
