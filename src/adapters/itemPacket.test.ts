import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { IndexedDbItemPacketStore } from './itemPacket'
import { IndexedDbPhotoStore } from './localPhotoStore'
import { DB_VERSION } from './dbConfig'

describe('IndexedDbItemPacketStore', () => {
  let store: IndexedDbItemPacketStore

  beforeEach(() => {
    // Install a fresh fake-indexeddb globally before constructing the store
    globalThis.indexedDB = new IDBFactory()
    // Use a unique DB name per test to avoid cross-test state
    store = new IndexedDbItemPacketStore(`test-item-db-${Date.now()}-${Math.random()}`, DB_VERSION)
  })

  it('creates first item with itemNumber 1', async () => {
    const item = await store.createItem('default-store', 'default-batch')
    expect(item.itemNumber).toBe(1)
    expect(item.status).toBe('draft')
    expect(item.photoIds).toEqual([])
    expect(item.storeId).toBe('default-store')
    expect(item.batchId).toBe('default-batch')
    expect(item.listingStatus).toBe('new')
  })

  it('increments itemNumber for subsequent items', async () => {
    const item1 = await store.createItem('default-store', 'default-batch')
    const item2 = await store.createItem('default-store', 'default-batch')
    const item3 = await store.createItem('default-store', 'default-batch')

    expect(item1.itemNumber).toBe(1)
    expect(item2.itemNumber).toBe(2)
    expect(item3.itemNumber).toBe(3)
  })

  it('adds photos in order to an item', async () => {
    const item = await store.createItem()
    await store.addItemPhoto(item.id, 'photo-001')
    await store.addItemPhoto(item.id, 'photo-002')
    await store.addItemPhoto(item.id, 'photo-003')

    const updated = await store.getItem(item.id)
    expect(updated?.photoIds).toEqual(['photo-001', 'photo-002', 'photo-003'])
  })

  it('first photo becomes main by default (first in photoIds array)', async () => {
    const item = await store.createItem()
    await store.addItemPhoto(item.id, 'photo-001')
    await store.addItemPhoto(item.id, 'photo-002')

    const updated = await store.getItem(item.id)
    expect(updated?.photoIds[0]).toBe('photo-001') // First photo is main
  })

  it('saves optional metadata without requiring it', async () => {
    const item = await store.createItem()
    await store.updateItemMetadata(item.id, { sku: 'SKU-123' })

    const updated = await store.getItem(item.id)
    expect(updated?.sku).toBe('SKU-123')
    expect(updated?.note).toBeUndefined()
    expect(updated?.weight).toBeUndefined()
  })

  it('updates all optional metadata fields', async () => {
    const item = await store.createItem()
    await store.updateItemMetadata(item.id, {
      sku: 'SKU-123',
      note: 'Test note',
      weight: '1.5kg',
      dimensions: '12 x 8 x 6 in',
    })

    const updated = await store.getItem(item.id)
    expect(updated?.sku).toBe('SKU-123')
    expect(updated?.note).toBe('Test note')
    expect(updated?.weight).toBe('1.5kg')
    expect(updated?.dimensions).toBe('12 x 8 x 6 in')
  })

  it('finalizes item status to complete', async () => {
    const item = await store.createItem()
    expect(item.status).toBe('draft')

    await store.finalizeItem(item.id)
    const finalized = await store.getItem(item.id)
    expect(finalized?.status).toBe('complete')
  })

  it('Done / Next creates next item and resets photo count', async () => {
    const item1 = await store.createItem()
    await store.addItemPhoto(item1.id, 'photo-001')
    await store.addItemPhoto(item1.id, 'photo-002')
    await store.finalizeItem(item1.id)

    const item2 = await store.createItem()
    expect(item2.itemNumber).toBe(2)
    expect(item2.photoIds).toEqual([]) // Reset photo count
    expect(item2.status).toBe('draft')
  })

  it('getCurrentItem returns most recent draft item', async () => {
    const item1 = await store.createItem()
    await store.finalizeItem(item1.id)

    const item2 = await store.createItem()
    const current = await store.getCurrentItem()

    expect(current?.id).toBe(item2.id)
    expect(current?.status).toBe('draft')
  })

  it('getCurrentItem can filter by store and batch', async () => {
    const item1 = await store.createItem('store-a', 'batch-a')
    const item2 = await store.createItem('store-b', 'batch-b')

    const currentA = await store.getCurrentItem('store-a', 'batch-a')
    const currentB = await store.getCurrentItem('store-b', 'batch-b')

    expect(currentA?.id).toBe(item1.id)
    expect(currentB?.id).toBe(item2.id)
  })

  it('updates listing status', async () => {
    const item = await store.createItem()
    await store.setListingStatus(item.id, 'listed')

    const updated = await store.getItem(item.id)
    expect(updated?.listingStatus).toBe('listed')
  })

  it('getCurrentItem returns null when no draft items exist', async () => {
    const item = await store.createItem()
    await store.finalizeItem(item.id)

    const current = await store.getCurrentItem()
    expect(current).toBeNull()
  })

  it('getAllItems returns all items', async () => {
    const item1 = await store.createItem()
    await store.finalizeItem(item1.id)
    const item2 = await store.createItem()

    const all = await store.getAllItems()
    expect(all).toHaveLength(2)
    const ids = all.map((i) => i.id)
    expect(ids).toContain(item1.id)
    expect(ids).toContain(item2.id)
  })

  it('deletes an item', async () => {
    const item = await store.createItem()
    await store.deleteItem(item.id)

    const deleted = await store.getItem(item.id)
    expect(deleted).toBeNull()
  })

  it('clearAll removes all items', async () => {
    await store.createItem()
    await store.createItem()
    await store.clearAll()

    const all = await store.getAllItems()
    expect(all).toEqual([])
  })

  describe('Open order compatibility with photo store', () => {
    it('photo store opens first, then item store opens', async () => {
      const dbName = `test-open-order-photo-first-${Date.now()}`
      globalThis.indexedDB = new IDBFactory()

      // Open photo store first
      const photoStore = new IndexedDbPhotoStore(dbName, DB_VERSION)
      const blob = new Blob(['test'], { type: 'image/jpeg' })
      await photoStore.save({
        id: 'photo-001',
        blob,
        mimeType: 'image/jpeg',
        size: blob.size,
        capturedAt: '2026-05-17T00:00:00.000Z',
      })

      // Then open item store
      const itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
      const item = await itemStore.createItem()

      // Both should work
      const photos = await photoStore.getAll()
      const items = await itemStore.getAllItems()

      expect(photos).toHaveLength(1)
      expect(items).toHaveLength(1)
      expect(photos[0].id).toBe('photo-001')
      expect(items[0].id).toBe(item.id)
    })

    it('item store opens first, then photo store opens', async () => {
      const dbName = `test-open-order-item-first-${Date.now()}`
      globalThis.indexedDB = new IDBFactory()

      // Open item store first
      const itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
      const item = await itemStore.createItem()

      // Then open photo store
      const photoStore = new IndexedDbPhotoStore(dbName, DB_VERSION)
      const blob = new Blob(['test'], { type: 'image/jpeg' })
      await photoStore.save({
        id: 'photo-001',
        blob,
        mimeType: 'image/jpeg',
        size: blob.size,
        capturedAt: '2026-05-17T00:00:00.000Z',
      })

      // Both should work
      const photos = await photoStore.getAll()
      const items = await itemStore.getAllItems()

      expect(photos).toHaveLength(1)
      expect(items).toHaveLength(1)
      expect(photos[0].id).toBe('photo-001')
      expect(items[0].id).toBe(item.id)
    })
  })
})
