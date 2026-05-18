/**
 * Item packet model for local-only item packet workflow.
 * Items are captured into item packets locally before upload.
 */

export type ItemStatus = 'draft' | 'complete' | 'uploaded'
export type ListingStatus = 'new' | 'listed' | 'hold' | 'needs_retake'

export interface PhotoReference {
  photoId: string
  order: number
}

export interface ItemPacket {
  id: string
  remoteId?: string
  storeId: string
  batchId: string
  itemNumber: number
  createdAt: string
  updatedAt: string
  status: ItemStatus
  photoIds: string[]
  listingStatus?: ListingStatus
  uploadStatus?: 'local' | 'queued' | 'uploading' | 'uploaded' | 'verified' | 'failed'
  remoteStatus?: 'local' | 'queued' | 'uploading' | 'uploaded' | 'verified' | 'deleted' | 'failed'
  remoteUpdatedAt?: string
  listedAt?: string
  remoteDeleteEligibleAt?: string
  remoteExpiresAt?: string
  remoteDeletedAt?: string
  // Optional metadata
  sku?: string
  note?: string
  weight?: string
}

export interface LocalItemPacketStore {
  createItem(storeId: string, batchId: string): Promise<ItemPacket>
  addItemPhoto(itemId: string, photoId: string): Promise<void>
  updateItemMetadata(itemId: string, metadata: Partial<Pick<ItemPacket, 'sku' | 'note' | 'weight'>>): Promise<void>
  setListingStatus(itemId: string, listingStatus: ListingStatus): Promise<void>
  updateItem(itemId: string, patch: Partial<ItemPacket>): Promise<void>
  finalizeItem(itemId: string): Promise<void>
  getCurrentItem(storeId?: string, batchId?: string): Promise<ItemPacket | null>
  getAllItems(): Promise<ItemPacket[]>
  getItem(itemId: string): Promise<ItemPacket | null>
  deleteItem(itemId: string): Promise<void>
  clearAll(): Promise<void>
}

import { BATCH_STORE_NAME, DB_NAME, DB_VERSION, ITEM_STORE_NAME, PHOTO_STORE_NAME, STORE_STORE_NAME } from './dbConfig'

const DEFAULT_STORE_ID = 'default-store'
const DEFAULT_BATCH_ID = 'default-batch'

function openItemDb(
  dbName = DB_NAME,
  version = DB_VERSION,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version)
    req.onupgradeneeded = () => {
      const db = req.result

      // Create item-packets store
      if (!db.objectStoreNames.contains(ITEM_STORE_NAME)) {
        const store = db.createObjectStore(ITEM_STORE_NAME, { keyPath: 'id' })
        store.createIndex('storeId', 'storeId', { unique: false })
        store.createIndex('batchId', 'batchId', { unique: false })
        store.createIndex('itemNumber', 'itemNumber', { unique: false })
      }

      // Ensure pending-photos store exists (for compatibility when item store opens first)
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' })
      }
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

export class IndexedDbItemPacketStore implements LocalItemPacketStore {
  private dbPromise: Promise<IDBDatabase>

  constructor(dbName = DB_NAME, version = DB_VERSION) {
    this.dbPromise = openItemDb(dbName, version)
  }

  private async tx(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest | void,
  ): Promise<IDBRequest | void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ITEM_STORE_NAME, mode)
      const store = tx.objectStore(ITEM_STORE_NAME)
      const req = fn(store)
      tx.oncomplete = () => resolve(req)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  }

  async createItem(storeId = DEFAULT_STORE_ID, batchId = DEFAULT_BATCH_ID): Promise<ItemPacket> {
    const allItems = await this.getAllItems()
    const maxItemNumber = allItems.length > 0
      ? Math.max(...allItems.map((i) => i.itemNumber))
      : 0
    const nextItemNumber = maxItemNumber + 1

    const item: ItemPacket = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      storeId,
      batchId,
      itemNumber: nextItemNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      photoIds: [],
      listingStatus: 'new',
      uploadStatus: 'local',
    }

    await this.tx('readwrite', (store) => store.put(item))
    return item
  }

  async addItemPhoto(itemId: string, photoId: string): Promise<void> {
    const item = await this.getItem(itemId)
    if (!item) {
      throw new Error(`Item ${itemId} not found`)
    }

    // Add photo ID to ordered list
    const updatedPhotoIds = [...item.photoIds, photoId]
    const updatedItem: ItemPacket = {
      ...item,
      photoIds: updatedPhotoIds,
      updatedAt: new Date().toISOString(),
    }

    await this.tx('readwrite', (store) => store.put(updatedItem))
  }

  async updateItemMetadata(
    itemId: string,
    metadata: Partial<Pick<ItemPacket, 'sku' | 'note' | 'weight'>>,
  ): Promise<void> {
    await this.updateItem(itemId, metadata)
  }

  async setListingStatus(itemId: string, listingStatus: ListingStatus): Promise<void> {
    const listedAt = listingStatus === 'listed' ? new Date().toISOString() : undefined
    await this.updateItem(itemId, {
      listingStatus,
      listedAt,
    })
  }

  async updateItem(itemId: string, patch: Partial<ItemPacket>): Promise<void> {
    const item = await this.getItem(itemId)
    if (!item) {
      throw new Error(`Item ${itemId} not found`)
    }

    const updatedItem: ItemPacket = {
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
    }

    await this.tx('readwrite', (store) => store.put(updatedItem))
  }

  async finalizeItem(itemId: string): Promise<void> {
    await this.updateItem(itemId, { status: 'complete' })
  }

  async getCurrentItem(storeId?: string, batchId?: string): Promise<ItemPacket | null> {
    const allItems = await this.getAllItems()
    // Return the most recent draft item, if any
    const draftItems = allItems.filter((i) => {
      const matchesStore = storeId ? i.storeId === storeId : true
      const matchesBatch = batchId ? i.batchId === batchId : true
      return i.status === 'draft' && matchesStore && matchesBatch
    })
    if (draftItems.length === 0) {
      return null
    }
    // Return the last created draft item
    return draftItems[draftItems.length - 1]
  }

  async getAllItems(): Promise<ItemPacket[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ITEM_STORE_NAME, 'readonly')
      const store = tx.objectStore(ITEM_STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as ItemPacket[])
      req.onerror = () => reject(req.error)
    })
  }

  async getItem(itemId: string): Promise<ItemPacket | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ITEM_STORE_NAME, 'readonly')
      const store = tx.objectStore(ITEM_STORE_NAME)
      const req = store.get(itemId)
      req.onsuccess = () => resolve(req.result as ItemPacket || null)
      req.onerror = () => reject(req.error)
    })
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(itemId))
  }

  async clearAll(): Promise<void> {
    await this.tx('readwrite', (store) => store.clear())
  }
}
