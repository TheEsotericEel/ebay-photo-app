import { OutputRatio } from './imageProcessing'
import { BATCH_STORE_NAME, DB_NAME, DB_VERSION, ITEM_STORE_NAME, PHOTO_STORE_NAME, STORE_STORE_NAME } from './dbConfig'

const STORE_NAME = PHOTO_STORE_NAME

export interface StoredPhoto {
  id: string
  remoteId?: string
  blob: Blob
  mimeType: string
  size: number
  capturedAt: string
  savedAt: string
  uploadStatus?: 'local' | 'queued' | 'uploading' | 'uploaded' | 'verified' | 'failed'
  remoteStatus?: 'not_uploaded' | 'uploaded' | 'verified' | 'delete_eligible' | 'deleting' | 'deleted' | 'failed'
  // Optional metadata for diagnostics - backward compatible
  sourceWidth?: number
  sourceHeight?: number
  outputWidth?: number
  outputHeight?: number
  captureMethod?: 'takePhoto' | 'grabFrame' | 'canvas'
  initialStreamWidth?: number
  initialStreamHeight?: number
  capabilitiesWidthMax?: number
  capabilitiesHeightMax?: number
  finalStreamWidth?: number
  finalStreamHeight?: number
  // Original high-res capture (separate from listing-ready square crop)
  originalBlob?: Blob
  originalMimeType?: string
  originalSize?: number
  originalWidth?: number
  originalHeight?: number
  // Thumbnail for preview
  thumbnailBlob?: Blob
  thumbnailSize?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
  // Selected output ratio for this capture
  ratio?: OutputRatio
}

export interface LocalPhotoStore {
  save(photo: Omit<StoredPhoto, 'savedAt'>): Promise<StoredPhoto>
  getAll(): Promise<StoredPhoto[]>
  getPhoto(id: string): Promise<StoredPhoto | null>
  updatePhoto(id: string, patch: Partial<StoredPhoto>): Promise<void>
  delete(id: string): Promise<void>
  clearAll(): Promise<void>
  count(): Promise<number>
}

function openDb(
  dbName = DB_NAME,
  version = DB_VERSION,
  _storeName = STORE_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version)
    req.onupgradeneeded = () => {
      const db = req.result
      // Create pending-photos store
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
      // Create item-packets store (for compatibility when photo store opens first)
      if (!db.objectStoreNames.contains(ITEM_STORE_NAME)) {
        const store = db.createObjectStore(ITEM_STORE_NAME, { keyPath: 'id' })
        store.createIndex('storeId', 'storeId', { unique: false })
        store.createIndex('batchId', 'batchId', { unique: false })
        store.createIndex('itemNumber', 'itemNumber', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDbPhotoStore implements LocalPhotoStore {
  private dbPromise: Promise<IDBDatabase>
  private readonly storeName: string

  constructor(dbName = DB_NAME, version = DB_VERSION, storeName = STORE_NAME) {
    this.storeName = storeName
    this.dbPromise = openDb(dbName, version, storeName)
  }

  private async tx(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest | void,
  ): Promise<IDBRequest | void> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode)
      const store = tx.objectStore(this.storeName)
      const req = fn(store)
      tx.oncomplete = () => resolve(req)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  }

  async save(photo: Omit<StoredPhoto, 'savedAt'>): Promise<StoredPhoto> {
    const record: StoredPhoto = {
      ...photo,
      uploadStatus: photo.uploadStatus || 'local',
      remoteStatus: photo.remoteStatus || 'not_uploaded',
      savedAt: new Date().toISOString(),
    }
    await this.tx('readwrite', (store) => store.put(record))
    return record
  }

  async getAll(): Promise<StoredPhoto[]> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as StoredPhoto[])
      req.onerror = () => reject(req.error)
    })
  }

  async getPhoto(id: string): Promise<StoredPhoto | null> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const req = store.get(id)
      req.onsuccess = () => resolve((req.result as StoredPhoto) || null)
      req.onerror = () => reject(req.error)
    })
  }

  async updatePhoto(id: string, patch: Partial<StoredPhoto>): Promise<void> {
    const current = await this.getPhoto(id)
    if (!current) {
      throw new Error(`Photo ${id} not found`)
    }

    const updated: StoredPhoto = {
      ...current,
      ...patch,
    }

    await this.tx('readwrite', (store) => store.put(updated))
  }

  async delete(id: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(id))
  }

  async clearAll(): Promise<void> {
    await this.tx('readwrite', (store) => store.clear())
  }

  async count(): Promise<number> {
    const db = await this.dbPromise
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const req = store.count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
}
