import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { IDBFactory } from 'fake-indexeddb'
import { DB_VERSION } from './dbConfig'
import { IndexedDbItemPacketStore } from './itemPacket'
import { IndexedDbPhotoStore } from './localPhotoStore'
import { IndexedDbWorkflowStore } from './workflowStore'
import { importRemoteBatchToLocal } from './remoteImport'

const RUN_LIVE = process.env.RUN_LIVE_IMPORT === '1'

function loadEnvLocal(): { url: string; anonKey: string } | null {
  const fromProcess = {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
  }
  if (fromProcess.url && fromProcess.anonKey) {
    return { url: fromProcess.url, anonKey: fromProcess.anonKey }
  }

  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    return null
  }
  const raw = readFileSync(envPath, 'utf8')
  const values: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  const url = values.VITE_SUPABASE_URL
  const anonKey = values.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

const liveEnv = loadEnvLocal()

describe.skipIf(!RUN_LIVE || !liveEnv)('importRemoteBatchToLocal live Supabase', () => {
  let workflowStore: IndexedDbWorkflowStore
  let itemStore: IndexedDbItemPacketStore
  let photoStore: IndexedDbPhotoStore
  let localStoreId: string
  let localBatchId: string

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    const dbName = `remote-import-live-${Date.now()}`
    photoStore = new IndexedDbPhotoStore(dbName, DB_VERSION)
    itemStore = new IndexedDbItemPacketStore(dbName, DB_VERSION)
    workflowStore = new IndexedDbWorkflowStore(dbName, DB_VERSION)

    const store = await workflowStore.ensureDefaultStore()
    const batch = await workflowStore.ensureDefaultBatch(store.id)
    await workflowStore.updateStore(store.id, { shortCode: 'DEF', name: 'Default Store' })
    await workflowStore.updateBatch(batch.id, { name: 'Current Batch' })
    localStoreId = store.id
    localBatchId = batch.id
  })

  it('imports native-uploaded batch from live Supabase and is idempotent', async () => {
    const client = createClient(liveEnv!.url, liveEnv!.anonKey)
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: 'the.esoteric.eel@gmail.com',
      password: 'password',
    })
    expect(authError).toBeNull()
    expect(authData.session).toBeTruthy()

    const store = {
      ...(await workflowStore.getStore(localStoreId))!,
      shortCode: 'DEF',
      name: 'Default Store',
    }
    const batch = {
      ...(await workflowStore.getBatch(localBatchId))!,
      name: 'Current Batch',
    }

    const first = await importRemoteBatchToLocal({
      client,
      store,
      batch,
      localItems: [],
      localPhotos: [],
      workflowStore,
      itemStore,
      photoStore,
    })

    expect(first.errors, first.errors.join(' | ')).toEqual([])
    expect(first.importedItems).toBeGreaterThan(0)
    expect(first.importedPhotos).toBeGreaterThan(0)

    const itemsAfterFirst = await itemStore.getAllItems()
    const photosAfterFirst = await photoStore.getAll()
    const imported = itemsAfterFirst.find((item) => item.remoteId)
    expect(imported?.listingStatus).toBe('new')
    expect(imported?.photoIds.length).toBeGreaterThan(0)

    const coverPhoto = photosAfterFirst.find((photo) => photo.id === imported?.photoIds[0])
    expect(coverPhoto?.remoteId).toBeTruthy()
    // fake-indexeddb may not round-trip Blob fields reliably in vitest; browser import verifies thumbnails.

    const second = await importRemoteBatchToLocal({
      client,
      store,
      batch,
      localItems: itemsAfterFirst,
      localPhotos: photosAfterFirst,
      workflowStore,
      itemStore,
      photoStore,
    })
    expect(second.importedItems).toBe(0)
    expect(second.skippedItems).toBeGreaterThan(0)

    if (imported?.remoteId) {
      const { error: listedError } = await client
        .from('items')
        .update({ status: 'listed', listed_at: new Date().toISOString() })
        .eq('id', imported.remoteId)
      expect(listedError).toBeNull()

      const { data: remoteItem, error: fetchError } = await client
        .from('items')
        .select('status, listed_at')
        .eq('id', imported.remoteId)
        .maybeSingle()
      expect(fetchError).toBeNull()
      expect(remoteItem?.status).toBe('listed')
      expect(remoteItem?.listed_at).toBeTruthy()

      await client
        .from('items')
        .update({ status: 'new', listed_at: null })
        .eq('id', imported.remoteId)
    }
  }, 60000)
})
