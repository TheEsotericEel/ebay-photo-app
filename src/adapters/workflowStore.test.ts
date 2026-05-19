import { beforeEach, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { DB_VERSION } from './dbConfig'
import { IndexedDbWorkflowStore } from './workflowStore'

describe('IndexedDbWorkflowStore', () => {
  let store: IndexedDbWorkflowStore

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    store = new IndexedDbWorkflowStore(`test-workflow-db-${Date.now()}-${Math.random()}`, DB_VERSION)
  })

  it('creates a default store when none exist', async () => {
    const defaultStore = await store.ensureDefaultStore()
    expect(defaultStore.name).toBe('Default Store')

    const allStores = await store.getAllStores()
    expect(allStores).toHaveLength(1)
  })

  it('creates a default active batch for a store', async () => {
    const defaultStore = await store.ensureDefaultStore()
    const batch = await store.ensureDefaultBatch(defaultStore.id)

    expect(batch.storeId).toBe(defaultStore.id)
    expect(batch.status).toBe('active')

    const batches = await store.getBatches(defaultStore.id)
    expect(batches).toHaveLength(1)
    expect(batches[0].id).toBe(batch.id)
  })

  it('creates batches and updates batch status', async () => {
    const defaultStore = await store.ensureDefaultStore()
    const batch = await store.createBatch(defaultStore.id, 'Morning Batch')

    await store.updateBatchStatus(batch.id, 'ready_for_listing')
    const updated = await store.getBatch(batch.id)

    expect(updated?.name).toBe('Morning Batch')
    expect(updated?.status).toBe('ready_for_listing')
  })
})
