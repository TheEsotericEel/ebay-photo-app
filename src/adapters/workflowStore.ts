import { BATCH_STORE_NAME, DB_NAME, DB_VERSION, STORE_STORE_NAME } from './dbConfig'

export interface StoreRecord {
  id: string
  remoteId?: string
  name: string
  shortCode: string
  createdAt: string
  updatedAt: string
}

export type BatchStatus = 'active' | 'ready_for_listing' | 'archived'

export interface BatchItemMutation {
  id: string
  clientId: string
  itemId: string
  remoteItemId?: string
  createdAt: string
  baseRemoteUpdatedAt?: string
  patch: {
    listingStatus?: 'new' | 'listed' | 'hold' | 'needs_retake'
    listedAt?: string | null
    remoteDeleteEligibleAt?: string | null
    remoteExpiresAt?: string | null
    sku?: string | null
    note?: string | null
    weight?: string | null
    dimensions?: string | null
  }
}

export interface BatchRecord {
  id: string
  remoteId?: string
  storeId: string
  name: string
  status: BatchStatus
  remoteRetentionMode?: 'manual' | 'delete_24h_after_listed' | 'delete_3d_after_listed' | 'delete_7d_after_listed' | 'delete_7d_after_upload' | 'delete_7d_after_batch_complete'
  uploadStatus?: 'local' | 'partial' | 'uploaded' | 'failed'
  itemCount?: number
  photoCount?: number
  uploadCompletedAt?: string | null
  localCleanupCompletedAt?: string | null
  remoteExpiresAt?: string | null
  remoteDeletedAt?: string | null
  itemSyncCursor?: string
  pendingItemMutations?: BatchItemMutation[]
  createdAt: string
  updatedAt: string
}

function openWorkflowDb(dbName = DB_NAME, version = DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version)
    req.onupgradeneeded = () => {
      const db = req.result

      if (!db.objectStoreNames.contains(STORE_STORE_NAME)) {
        db.createObjectStore(STORE_STORE_NAME, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) {
        const batchStore = db.createObjectStore(BATCH_STORE_NAME, { keyPath: 'id' })
        batchStore.createIndex('storeId', 'storeId', { unique: false })
        batchStore.createIndex('status', 'status', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDbWorkflowStore {
  private dbPromise: Promise<IDBDatabase>

  constructor(dbName = DB_NAME, version = DB_VERSION) {
    this.dbPromise = openWorkflowDb(dbName, version)
  }

  private async tx(
    storeName: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest | void,
  ): Promise<IDBRequest | void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      const req = fn(store)
      tx.oncomplete = () => resolve(req)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as T[])
      req.onerror = () => reject(req.error)
    })
  }

  async getAllStores(): Promise<StoreRecord[]> {
    return this.getAll<StoreRecord>(STORE_STORE_NAME)
  }

  async getStore(storeId: string): Promise<StoreRecord | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_STORE_NAME)
      const req = store.get(storeId)
      req.onsuccess = () => resolve((req.result as StoreRecord) || null)
      req.onerror = () => reject(req.error)
    })
  }

  async ensureDefaultStore(): Promise<StoreRecord> {
    const stores = await this.getAllStores()
    if (stores.length > 0) {
      return stores[0]
    }

    const store: StoreRecord = {
      id: 'store-default',
      name: 'Default Store',
      shortCode: 'DEF',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.tx(STORE_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(store))
    return store
  }

  async createStore(name: string, shortCode: string): Promise<StoreRecord> {
    const store: StoreRecord = {
      id: `store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      shortCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.tx(STORE_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(store))
    return store
  }

  async upsertStore(store: StoreRecord): Promise<void> {
    await this.tx(STORE_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(store))
  }

  async updateStore(storeId: string, patch: Partial<StoreRecord>): Promise<void> {
    const store = await this.getStore(storeId)
    if (!store) {
      throw new Error(`Store ${storeId} not found`)
    }

    const updated: StoreRecord = {
      ...store,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await this.tx(STORE_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(updated))
  }

  async getBatches(storeId: string): Promise<BatchRecord[]> {
    const batches = await this.getAll<BatchRecord>(BATCH_STORE_NAME)
    return batches.filter((batch) => batch.storeId === storeId)
  }

  async getBatch(batchId: string): Promise<BatchRecord | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BATCH_STORE_NAME, 'readonly')
      const store = tx.objectStore(BATCH_STORE_NAME)
      const req = store.get(batchId)
      req.onsuccess = () => resolve((req.result as BatchRecord) || null)
      req.onerror = () => reject(req.error)
    })
  }

  async ensureDefaultBatch(storeId: string): Promise<BatchRecord> {
    const batches = await this.getBatches(storeId)
    const active = batches.find((batch) => batch.status === 'active')
    if (active) {
      return active
    }

    const batch: BatchRecord = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storeId,
      name: 'Current Batch',
      status: 'active',
      remoteRetentionMode: 'delete_7d_after_listed',
      uploadStatus: 'local',
      itemCount: 0,
      photoCount: 0,
      uploadCompletedAt: null,
      localCleanupCompletedAt: null,
      remoteExpiresAt: null,
      remoteDeletedAt: null,
      pendingItemMutations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.tx(BATCH_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(batch))
    return batch
  }

  async createBatch(storeId: string, name: string): Promise<BatchRecord> {
    const batch: BatchRecord = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storeId,
      name,
      status: 'active',
      remoteRetentionMode: 'delete_7d_after_listed',
      uploadStatus: 'local',
      itemCount: 0,
      photoCount: 0,
      uploadCompletedAt: null,
      localCleanupCompletedAt: null,
      remoteExpiresAt: null,
      remoteDeletedAt: null,
      pendingItemMutations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await this.tx(BATCH_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(batch))
    return batch
  }

  async upsertBatch(batch: BatchRecord): Promise<void> {
    await this.tx(BATCH_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(batch))
  }

  async updateBatchStatus(batchId: string, status: BatchStatus): Promise<void> {
    const batch = await this.getBatch(batchId)
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`)
    }

    const updated: BatchRecord = {
      ...batch,
      status,
      updatedAt: new Date().toISOString(),
    }
    await this.tx(BATCH_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(updated))
  }

  async updateBatch(batchId: string, patch: Partial<BatchRecord>): Promise<void> {
    const batch = await this.getBatch(batchId)
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`)
    }

    const updated: BatchRecord = {
      ...batch,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await this.tx(BATCH_STORE_NAME, 'readwrite', (dbStore) => dbStore.put(updated))
  }
}
