import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent } from 'react'
import { IndexedDbItemPacketStore, type ItemPacket, type ListingStatus } from '../adapters/itemPacket'
import { IndexedDbPhotoStore, type StoredPhoto } from '../adapters/localPhotoStore'
import {
  syncRemoteBatchDeltaToLocal,
  syncLocalWorkspaceToRemote,
  syncRemoteWorkspaceToLocal,
  type RemoteWorkspacePushSummary,
  type RemoteWorkspaceSyncSummary,
} from '../adapters/remoteImport'
import { calculateRetentionWindow, type RemoteRetentionMode } from '../adapters/retention'
import { IndexedDbWorkflowStore, type BatchRecord, type StoreRecord } from '../adapters/workflowStore'
import { createItemMutation, enqueueItemMutation, flushItemMutations, getClientId } from '../adapters/itemSync'
import { supabase } from '../lib/supabase'
import { useSupabaseSession } from '../lib/useSupabaseSession'

type StoreCounts = {
  total: number
  pending: number
  done: number
}

type DesktopStoreView = {
  id: string
  name: string
  shortCode?: string
  counts: StoreCounts
}

type DesktopItemView = {
  packet: ItemPacket
  label: string
  photoUrls: string[]
  photoCount: number
}

const IMPORT_POLL_MS = 45_000
const WORKSPACE_SYNC_POLL_MS = 45_000

const workflowStore = new IndexedDbWorkflowStore()
const itemPacketStore = new IndexedDbItemPacketStore()
const photoStore = new IndexedDbPhotoStore()

type ImportStatusPhase = 'idle' | 'checking' | 'success' | 'no-new' | 'error'

type ImportStatus = {
  phase: ImportStatusPhase
  message: string
}

function buildObjectUrlMap(photos: StoredPhoto[]): Record<string, string> {
  return photos.reduce<Record<string, string>>((acc, photo) => {
    acc[photo.id] = URL.createObjectURL(photo.blob)
    return acc
  }, {})
}

function pickActiveBatch(batches: BatchRecord[]): BatchRecord | null {
  if (batches.length === 0) {
    return null
  }
  const active = batches.find((batch) => batch.status === 'active')
  if (active) {
    return active
  }
  return [...batches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function isDoneStatus(status: ListingStatus | undefined): boolean {
  return status === 'listed'
}

function getListingStatusLabel(status: ListingStatus | undefined): string {
  switch (status) {
    case 'listed':
      return 'Listed'
    case 'hold':
      return 'Hold'
    case 'needs_retake':
      return 'Needs retake'
    default:
      return 'To list'
  }
}

function sanitizeExportStem(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function isListingQualityPhoto(photo: StoredPhoto): boolean {
  if (photo.originalBlob) {
    return true
  }
  if (!photo.thumbnailBlob) {
    return true
  }
  return (
    photo.thumbnailBlob.size !== photo.blob.size
    || photo.thumbnailWidth !== photo.outputWidth
    || photo.thumbnailHeight !== photo.outputHeight
  )
}

function buildPhotoDragExportPlan(item: DesktopItemView, photoById: Map<string, StoredPhoto>) {
  const baseName = sanitizeExportStem(item.packet.sku?.trim() || item.label, `item-${item.packet.itemNumber}`)
  const files: Array<{ file: File; ready: boolean }> = []
  let missingCount = 0
  let thumbnailOnlyCount = 0

  item.packet.photoIds.forEach((photoId, index) => {
    const photo = photoById.get(photoId)
    if (!photo) {
      missingCount += 1
      return
    }

    const ready = isListingQualityPhoto(photo)
    if (!ready) {
      thumbnailOnlyCount += 1
    }

    const fileName = `${String(index + 1).padStart(2, '0')}-${baseName}.jpg`
    files.push({
      file: new File([photo.blob], fileName, {
        type: photo.mimeType || photo.blob.type || 'image/jpeg',
        lastModified: Date.parse(photo.capturedAt) || Date.now(),
      }),
      ready,
    })
  })

  const canDrag = files.length > 0 && missingCount === 0 && thumbnailOnlyCount === 0
  const warning = missingCount > 0
    ? `Missing ${missingCount} photo${missingCount === 1 ? '' : 's'} locally.`
    : thumbnailOnlyCount > 0
      ? `${thumbnailOnlyCount} photo${thumbnailOnlyCount === 1 ? '' : 's'} only have thumbnail-quality blobs locally.`
      : null

  return {
    files,
    canDrag,
    warning,
    total: item.packet.photoIds.length,
    readyCount: files.filter((entry) => entry.ready).length,
    missingCount,
    thumbnailOnlyCount,
  }
}

function mapItemView(item: ItemPacket, photoUrlsById: Record<string, string>): DesktopItemView {
  const photoUrls = item.photoIds
    .map((photoId) => photoUrlsById[photoId])
    .filter((url): url is string => Boolean(url))
  const label = item.sku?.trim() ? item.sku : `Item ${item.itemNumber}`

  return {
    packet: item,
    label,
    photoUrls,
    photoCount: item.photoIds.length,
  }
}

function hasMetadata(item: DesktopItemView): boolean {
  const packet = item.packet
  return Boolean(packet.note || packet.weight || packet.dimensions || packet.sku)
}

function buildPhotoById(photos: StoredPhoto[]): Map<string, StoredPhoto> {
  return new Map(photos.map((photo) => [photo.id, photo]))
}

function getItemSortTimestamp(item: ItemPacket, photoById: Map<string, StoredPhoto>): number {
  const firstPhotoId = item.photoIds[0]
  if (firstPhotoId) {
    const photo = photoById.get(firstPhotoId)
    if (photo?.capturedAt) {
      const capturedAt = new Date(photo.capturedAt).getTime()
      if (!Number.isNaN(capturedAt)) {
        return capturedAt
      }
    }
  }

  if (item.createdAt) {
    const createdAt = new Date(item.createdAt).getTime()
    if (!Number.isNaN(createdAt)) {
      return createdAt
    }
  }

  return 0
}

function compareActiveItemsOldestFirst(
  a: ItemPacket,
  b: ItemPacket,
  photoById: Map<string, StoredPhoto>,
): number {
  const timeDelta = getItemSortTimestamp(a, photoById) - getItemSortTimestamp(b, photoById)
  if (timeDelta !== 0) {
    return timeDelta
  }
  if (a.itemNumber !== b.itemNumber) {
    return a.itemNumber - b.itemNumber
  }
  return a.id.localeCompare(b.id)
}

function filterStoreBatchItems(
  items: ItemPacket[],
  storeId: string,
  activeBatch: BatchRecord | null,
): ItemPacket[] {
  return items.filter((item) => {
    if (item.storeId !== storeId) {
      return false
    }
    if (!activeBatch) {
      return true
    }
    return item.batchId === activeBatch.id
  })
}

function formatImportStatusMessage(importedItems: number, updatedItems: number, errors: string[]): ImportStatus {
  if (errors.length > 0) {
    return {
      phase: 'error',
      message: `Import failed: ${errors[0]}`,
    }
  }
  if (importedItems > 0) {
    return {
      phase: 'success',
      message: `Imported ${importedItems} new item${importedItems === 1 ? '' : 's'}`,
    }
  }
  if (updatedItems > 0) {
    return {
      phase: 'success',
      message: `Updated ${updatedItems} synced item${updatedItems === 1 ? '' : 's'}`,
    }
  }
  return {
    phase: 'no-new',
    message: 'No new items',
  }
}

function formatWorkspaceSyncSummaryMessage(
  pushSummary: RemoteWorkspacePushSummary,
  pullSummary: RemoteWorkspaceSyncSummary,
): ImportStatus {
  if (pushSummary.errors.length > 0) {
    return {
      phase: 'error',
      message: `Workspace push failed: ${pushSummary.errors[0]}`,
    }
  }
  if (pullSummary.errors.length > 0) {
    return {
      phase: 'error',
      message: `Workspace sync failed: ${pullSummary.errors[0]}`,
    }
  }

  const parts: string[] = []
  if (pushSummary.pushedStores > 0) parts.push(`${pushSummary.pushedStores} store${pushSummary.pushedStores === 1 ? '' : 's'} pushed`)
  if (pushSummary.pushedBatches > 0) parts.push(`${pushSummary.pushedBatches} batch${pushSummary.pushedBatches === 1 ? '' : 'es'} pushed`)
  if (pullSummary.importedStores > 0) parts.push(`${pullSummary.importedStores} store${pullSummary.importedStores === 1 ? '' : 's'} pulled`)
  if (pullSummary.importedBatches > 0) parts.push(`${pullSummary.importedBatches} batch${pullSummary.importedBatches === 1 ? '' : 'es'} pulled`)
  if (pullSummary.importedItems > 0) parts.push(`${pullSummary.importedItems} item${pullSummary.importedItems === 1 ? '' : 's'} pulled`)
  if (pullSummary.updatedItems > 0) parts.push(`${pullSummary.updatedItems} item${pullSummary.updatedItems === 1 ? '' : 's'} refreshed`)
  if (pullSummary.importedPhotos > 0) parts.push(`${pullSummary.importedPhotos} photo${pullSummary.importedPhotos === 1 ? '' : 's'} pulled`)

  if (parts.length === 0) {
    return {
      phase: 'no-new',
      message: 'Workspace already in sync',
    }
  }

  return {
    phase: 'success',
    message: `Synced ${parts.join(' · ')}`,
  }
}

export function DesktopListerPrototype() {
  const {
    session,
    loading: authLoading,
    error: authError,
    signInWithPassword,
    signOut,
    configured: supabaseReady,
  } = useSupabaseSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [passwordSigningIn, setPasswordSigningIn] = useState(false)

  const [stores, setStores] = useState<StoreRecord[]>([])
  const [items, setItems] = useState<ItemPacket[]>([])
  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [batchesByStore, setBatchesByStore] = useState<Record<string, BatchRecord | null>>({})
  const [photoUrlsById, setPhotoUrlsById] = useState<Record<string, string>>({})
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>({ phase: 'idle', message: '' })
  const [importingRemote, setImportingRemote] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const photoUrlsRef = useRef<Record<string, string>>({})
  const importInFlightRef = useRef(false)
  const workspaceBootstrapAttemptedRef = useRef(false)
  const realtimeImportTimerRef = useRef<number | null>(null)

  const photoById = useMemo(() => buildPhotoById(photos), [photos])

  const loadDesktopData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setDataLoading(true)
    }
    setDataError(null)

    try {
      const [rawStores, rawItems, rawPhotos] = await Promise.all([
        workflowStore.getAllStores(),
        itemPacketStore.getAllItems(),
        photoStore.getAll(),
      ])

      const batchEntries = await Promise.all(
        rawStores.map(async (store) => {
          const batches = await workflowStore.getBatches(store.id)
          return [store.id, pickActiveBatch(batches)] as const
        }),
      )

      Object.values(photoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      const nextPhotoUrls = buildObjectUrlMap(rawPhotos)
      photoUrlsRef.current = nextPhotoUrls

      setStores(rawStores)
      setItems(rawItems)
      setPhotos(rawPhotos)
      setBatchesByStore(Object.fromEntries(batchEntries))
      setPhotoUrlsById(nextPhotoUrls)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : String(error))
    } finally {
      if (!options?.silent) {
        setDataLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadDesktopData()
    return () => {
      Object.values(photoUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      photoUrlsRef.current = {}
    }
  }, [loadDesktopData])

  const runRemoteImport = useCallback(async (storeId: string) => {
    if (!supabase || !session || importInFlightRef.current) {
      return
    }

    const store = await workflowStore.getStore(storeId)
    if (!store) {
      setImportStatus({ phase: 'error', message: 'Import failed: store not found' })
      return
    }

    const storeBatches = await workflowStore.getBatches(store.id)
    const batch = pickActiveBatch(storeBatches) ?? await workflowStore.ensureDefaultBatch(store.id)

    importInFlightRef.current = true
    setImportingRemote(true)
    setImportStatus({ phase: 'checking', message: 'Checking for new items…' })

    try {
      await flushItemMutations({
        client: supabase,
        workflowStore,
        itemStore: itemPacketStore,
        batchId: batch.id,
      })

      const summary = await syncRemoteBatchDeltaToLocal({
        client: supabase,
        store,
        batch,
        workflowStore,
        itemStore: itemPacketStore,
        photoStore,
      })

      await loadDesktopData({ silent: true })
      setImportStatus(formatImportStatusMessage(summary.importedItems, summary.updatedItems, summary.errors))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setImportStatus({ phase: 'error', message: `Import failed: ${message}` })
    } finally {
      importInFlightRef.current = false
      setImportingRemote(false)
    }
  }, [loadDesktopData, session])

  const runWorkspaceSync = useCallback(async () => {
    if (!supabase || !session || importInFlightRef.current) {
      return
    }

    importInFlightRef.current = true
    setImportingRemote(true)
    setImportStatus({ phase: 'checking', message: 'Syncing workspace from Supabase…' })
    setActionError(null)

    try {
      const localStores = await workflowStore.getAllStores()
      for (const store of localStores) {
        const batches = await workflowStore.getBatches(store.id)
        for (const batch of batches) {
          if (!batch.pendingItemMutations || batch.pendingItemMutations.length === 0) {
            continue
          }
          await flushItemMutations({
            client: supabase,
            workflowStore,
            itemStore: itemPacketStore,
            batchId: batch.id,
          })
        }
      }

      const pushSummary = await syncLocalWorkspaceToRemote({
        client: supabase,
        workflowStore,
      })
      const summary = await syncRemoteWorkspaceToLocal({
        client: supabase,
        workflowStore,
        itemStore: itemPacketStore,
        photoStore,
      })

      await loadDesktopData({ silent: true })
      setImportStatus(formatWorkspaceSyncSummaryMessage(pushSummary, summary))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setImportStatus({ phase: 'error', message: `Workspace sync failed: ${message}` })
    } finally {
      importInFlightRef.current = false
      setImportingRemote(false)
    }
  }, [loadDesktopData, photoStore, session, supabase, workflowStore])

  useEffect(() => {
    if (!session || !selectedStoreId || !supabase) {
      return
    }
    void runRemoteImport(selectedStoreId)
  }, [selectedStoreId, session, runRemoteImport])

  useEffect(() => {
    if (!session || !supabase || !selectedStoreId) {
      return
    }
    const realtimeClient = supabase

    const selectedBatch = batchesByStore[selectedStoreId]
    const selectedStore = stores.find((store) => store.id === selectedStoreId) || null
    if (!selectedBatch?.remoteId || !selectedStore?.remoteId) {
      return
    }

    const channel = realtimeClient
      .channel(`desktop-items-poke-${selectedBatch.remoteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `batch_id=eq.${selectedBatch.remoteId}`,
        },
        () => {
          if (realtimeImportTimerRef.current) {
            window.clearTimeout(realtimeImportTimerRef.current)
          }
          realtimeImportTimerRef.current = window.setTimeout(() => {
            void runRemoteImport(selectedStoreId)
          }, 600)
        },
      )
      .subscribe()

    return () => {
      if (realtimeImportTimerRef.current) {
        window.clearTimeout(realtimeImportTimerRef.current)
        realtimeImportTimerRef.current = null
      }
      void realtimeClient.removeChannel(channel)
    }
  }, [batchesByStore, runRemoteImport, selectedStoreId, session, stores])

  useEffect(() => {
    if (!session || !selectedStoreId || !supabase) {
      return
    }

    const intervalId = window.setInterval(() => {
      void runRemoteImport(selectedStoreId)
    }, IMPORT_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedStoreId, session, runRemoteImport])

  useEffect(() => {
    if (!session || !supabase) {
      return
    }

    const intervalId = window.setInterval(() => {
      void runWorkspaceSync()
    }, WORKSPACE_SYNC_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [session, runWorkspaceSync, supabase])

  useEffect(() => {
    if (!session || !supabase || workspaceBootstrapAttemptedRef.current) {
      return
    }
    if (stores.length > 0 || dataLoading) {
      return
    }

    workspaceBootstrapAttemptedRef.current = true
    void runWorkspaceSync()
  }, [dataLoading, runWorkspaceSync, session, stores.length, supabase])

  useEffect(() => {
    if (!session) {
      workspaceBootstrapAttemptedRef.current = false
    }
  }, [session])

  const storeViews = useMemo<DesktopStoreView[]>(() => {
    return stores.map((store) => {
      const activeBatch = batchesByStore[store.id]
      const storeItems = filterStoreBatchItems(items, store.id, activeBatch)
      const done = storeItems.filter((item) => isDoneStatus(item.listingStatus)).length
      const pending = storeItems.length - done

      return {
        id: store.id,
        name: store.name,
        shortCode: store.shortCode,
        counts: {
          total: storeItems.length,
          pending,
          done,
        },
      }
    })
  }, [stores, items, batchesByStore])

  const selectedStore = useMemo(
    () => storeViews.find((store) => store.id === selectedStoreId) ?? null,
    [storeViews, selectedStoreId],
  )

  useEffect(() => {
    if (selectedStoreId || storeViews.length === 0) {
      return
    }
    setSelectedStoreId(storeViews[0].id)
  }, [selectedStoreId, storeViews])

  const storeItemViews = useMemo(() => {
    if (!selectedStoreId) {
      return []
    }
    const activeBatch = batchesByStore[selectedStoreId]
    const filtered = filterStoreBatchItems(items, selectedStoreId, activeBatch)
      .filter((item) => !isDoneStatus(item.listingStatus))

    return filtered
      .sort((a, b) => compareActiveItemsOldestFirst(a, b, photoById))
      .map((item) => mapItemView(item, photoUrlsById))
  }, [items, selectedStoreId, batchesByStore, photoUrlsById, photoById])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) {
      return null
    }
    const packet = items.find((item) => item.id === selectedItemId)
    if (!packet) {
      return null
    }
    return mapItemView(packet, photoUrlsById)
  }, [items, selectedItemId, photoUrlsById])

  const updateItemListingStatus = useCallback(async (item: ItemPacket, status: ListingStatus) => {
    const now = new Date().toISOString()
    const isListed = status === 'listed'
    const batch = batchesByStore[item.storeId] ?? null
    const retentionMode = (batch?.remoteRetentionMode || 'delete_7d_after_listed') as RemoteRetentionMode
    const retentionWindow = isListed
      ? calculateRetentionWindow(now, retentionMode)
      : { eligibleAt: null, expiresAt: null }

    setUpdatingItemId(item.id)
    setActionError(null)

    try {
      const localPatch = {
        listingStatus: status,
        listedAt: isListed ? now : undefined,
        remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
        remoteExpiresAt: retentionWindow.expiresAt || undefined,
      }

      await itemPacketStore.updateItem(item.id, localPatch)

      for (const photoId of item.photoIds) {
        await photoStore.updatePhoto(photoId, {
          remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
          remoteExpiresAt: retentionWindow.expiresAt || undefined,
        }).catch(() => undefined)
      }

      if (session && supabase && item.remoteId) {
        const mutation = createItemMutation({
          clientId: getClientId(),
          item: {
            ...item,
            ...localPatch,
          },
          patch: {
            listingStatus: status,
            listedAt: isListed ? now : null,
            remoteDeleteEligibleAt: retentionWindow.eligibleAt,
            remoteExpiresAt: retentionWindow.expiresAt,
          },
        })

        await enqueueItemMutation({
          workflowStore,
          batchId: item.batchId,
          mutation,
        })

        const flushSummary = await flushItemMutations({
          client: supabase,
          workflowStore,
          itemStore: itemPacketStore,
          batchId: item.batchId,
        })
        if (flushSummary.errors.length > 0) {
          throw new Error(`Remote item queue flush failed: ${flushSummary.errors[0]}`)
        }
      }

      await loadDesktopData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setUpdatingItemId(null)
    }
  }, [batchesByStore, loadDesktopData, session, supabase])

  const handleSignInWithPassword = useCallback(async () => {
    setPasswordSigningIn(true)
    setLoginError(null)
    setLoginMessage(null)
    try {
      await signInWithPassword(email, password)
      setLoginMessage('Signed in with password.')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error))
    } finally {
      setPasswordSigningIn(false)
    }
  }, [email, password, signInWithPassword])

  if (authLoading) {
    return <div style={styles.loadingState}>Loading authentication...</div>
  }

  if (!supabaseReady) {
    return (
      <div style={styles.loadingState}>
        <h2 style={styles.title}>Desktop Lister</h2>
        <p style={styles.subtleText}>Supabase client is not configured. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to continue.</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.authCard}>
          <h1 style={styles.title}>Desktop Lister</h1>
          <p style={styles.subtleText}>Sign in to continue. Google sign-in is planned soon.</p>
          <label style={styles.label} htmlFor="prototype-email-input">Email</label>
          <input
            id="prototype-email-input"
            style={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <label style={styles.label} htmlFor="prototype-password-input">Password</label>
          <input
            id="prototype-password-input"
            style={styles.input}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
          />
          <div style={styles.headerActions}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={handleSignInWithPassword}
              disabled={passwordSigningIn || !email.trim() || !password.trim()}
            >
              {passwordSigningIn ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
          <p style={styles.subtleText}>
            App account creation is handled in iOS or Supabase Dashboard for now.
          </p>
          {authError ? <p style={styles.errorText}>{authError}</p> : null}
          {loginError ? <p style={styles.errorText}>{loginError}</p> : null}
          {loginMessage ? <p style={styles.infoText}>{loginMessage}</p> : null}
        </div>
      </div>
    )
  }

  if (!selectedStore) {
    return (
      <div style={styles.page}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Choose a store</h1>
            <p style={styles.subtleText}>
              {dataLoading ? 'Loading local stores and items...' : 'Pick a store to review item bundles.'}
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void runWorkspaceSync()}
              disabled={importingRemote}
            >
              {importingRemote ? 'Syncing…' : 'Sync Workspace'}
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </header>

        {dataError ? <p style={styles.errorText}>{dataError}</p> : null}
        {actionError ? <p style={styles.errorText}>{actionError}</p> : null}

        {dataLoading ? (
          <p style={styles.subtleText}>Loading...</p>
        ) : storeViews.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No stores yet</p>
            <p style={styles.subtleText}>
              Sync with Supabase to pull in iOS uploads, store records, and batches.
            </p>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => void runWorkspaceSync()}
              disabled={importingRemote}
            >
              {importingRemote ? 'Syncing…' : 'Sync Workspace'}
            </button>
          </div>
        ) : (
          <section style={storeViews.length === 2 ? styles.storeGridTwo : styles.storeGrid}>
            {storeViews.map((store, index) => (
              <button
                key={store.id}
                type="button"
                onClick={() => {
                  setSelectedStoreId(store.id)
                  setSelectedItemId(null)
                  setActionError(null)
                }}
                style={styles.storeCardButton}
              >
                <div style={styles.storeCardTitle}>
                  {storeViews.length === 2 ? `Store ${index === 0 ? 'A' : 'B'}` : store.name}
                </div>
                {storeViews.length === 2 ? (
                  <div style={styles.storeCardSubtitle}>{store.name}{store.shortCode ? ` (${store.shortCode})` : ''}</div>
                ) : null}
                <div style={styles.storeCardCount}>
                  {store.counts.pending} to list · {store.counts.done} done
                </div>
                <div style={styles.storeCardMeta}>{store.counts.total} items</div>
              </button>
            ))}
          </section>
        )}

      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setSelectedStoreId(null)
              setSelectedItemId(null)
              setActionError(null)
            }}
          >
            Back
          </button>
          <div>
            <h1 style={styles.title}>{selectedStore.name}</h1>
            <p style={styles.subtleText}>
              {selectedStore.counts.pending} to list
              {selectedStore.counts.done > 0 ? ` · ${selectedStore.counts.done} done` : ''}
            </p>
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => void runWorkspaceSync()}
            disabled={importingRemote}
          >
            {importingRemote ? 'Syncing…' : 'Sync Workspace'}
          </button>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => void runRemoteImport(selectedStore.id)}
            disabled={importingRemote}
          >
            {importingRemote ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {importStatus.message ? (
        <p style={importStatusStyle(importStatus.phase)}>{importStatus.message}</p>
      ) : null}
      {actionError ? <p style={styles.errorText}>{actionError}</p> : null}

      {storeItemViews.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>
            {selectedStore.counts.done > 0 ? 'All active items are done' : 'No items waiting to list'}
          </p>
          <p style={styles.subtleText}>
            {importingRemote
              ? 'Checking Supabase for new uploads…'
              : selectedStore.counts.done > 0
                ? `${selectedStore.counts.done} completed item${selectedStore.counts.done === 1 ? '' : 's'} are hidden from this queue.`
                : 'New iOS uploads should appear here automatically after refresh or a workspace sync.'}
          </p>
        </div>
      ) : (
        <section style={styles.itemGrid}>
          {storeItemViews.map((item) => {
            const status = item.packet.listingStatus
            const busy = updatingItemId === item.packet.id
            return (
              <article key={item.packet.id} style={getItemCardStyle(status)}>
                <button
                  type="button"
                  style={styles.cardMainButton}
                  onClick={() => setSelectedItemId(item.packet.id)}
                >
                  <StackedPreview photos={item.photoUrls} />
                  <div style={styles.cardHeaderRow}>
                    <span style={statusBadgeStyle(status)}>{getListingStatusLabel(status)}</span>
                    {hasMetadata(item) ? <div style={styles.metadataChip}>metadata</div> : null}
                  </div>
                  <div style={styles.itemTitle}>{item.label}</div>
                  <div style={styles.itemMeta}>{item.photoCount} photos</div>
                </button>
                <ListingStatusControls
                  currentStatus={status}
                  busy={busy}
                  onChange={(nextStatus) => void updateItemListingStatus(item.packet, nextStatus)}
                />
              </article>
            )
          })}
        </section>
      )}

      {selectedItem ? (
        <ItemDetailModal
          item={selectedItem}
          status={selectedItem.packet.listingStatus}
          storeName={selectedStore?.name ?? 'Store'}
          batchName={selectedStoreId ? (batchesByStore[selectedStoreId]?.name ?? 'Current batch') : 'Current batch'}
          photoById={photoById}
          busy={updatingItemId === selectedItem.packet.id}
          onClose={() => setSelectedItemId(null)}
          onChangeStatus={(nextStatus) => void updateItemListingStatus(selectedItem.packet, nextStatus)}
        />
      ) : null}
    </div>
  )
}

function StackedPreview({ photos }: { photos: string[] }) {
  const front = photos[0]
  const second = photos[1]
  const third = photos[2]

  return (
    <div style={styles.previewWrap}>
      {third ? <img style={styles.previewThird} src={third} alt="" /> : null}
      {second ? <img style={styles.previewSecond} src={second} alt="" /> : null}
      {front ? (
        <img style={styles.previewFront} src={front} alt="Item photo" />
      ) : (
        <div style={styles.previewPlaceholder}>No photo</div>
      )}
    </div>
  )
}

function ItemDetailModal({
  item,
  status,
  storeName,
  batchName,
  photoById,
  busy,
  onClose,
  onChangeStatus,
}: {
  item: DesktopItemView
  status: ListingStatus | undefined
  storeName: string
  batchName: string
  photoById: Map<string, StoredPhoto>
  busy: boolean
  onClose: () => void
  onChangeStatus: (status: ListingStatus) => void
}) {
  const packet = item.packet
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [item.packet.id])

  const activePhotoUrl = item.photoUrls[activePhotoIndex] ?? item.photoUrls[0] ?? null
  const metadataFields = [
    { label: 'SKU', value: packet.sku },
    { label: 'Weight', value: packet.weight },
    { label: 'Dimensions', value: packet.dimensions },
    { label: 'Notes', value: packet.note, wide: true },
  ]
  const hasMetadata = metadataFields.some((field) => Boolean(field.value?.trim()))
  const dragExportPlan = useMemo(() => buildPhotoDragExportPlan(item, photoById), [item, photoById])

  const handleDragStart = useCallback((event: ReactDragEvent<HTMLButtonElement>) => {
    if (!dragExportPlan.canDrag) {
      event.preventDefault()
      return
    }

    const transfer = event.dataTransfer
    if (!transfer) {
      return
    }

    transfer.effectAllowed = 'copy'
    transfer.clearData()
    dragExportPlan.files.forEach((entry) => {
      transfer.items.add(entry.file)
    })
    transfer.setData('text/plain', dragExportPlan.files.map((entry) => entry.file.name).join('\n'))
  }, [dragExportPlan])

  return (
    <div style={styles.modalBackdrop} onClick={onClose} role="presentation">
      <section
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.label} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>{item.label}</h2>
            <div style={styles.modalContextRow}>
              <span style={statusBadgeStyle(status)}>{getListingStatusLabel(status)}</span>
              <span style={styles.modalContextText}>{storeName}</span>
              <span style={styles.modalContextDivider}>·</span>
              <span style={styles.modalContextText}>{batchName}</span>
              <span style={styles.modalContextDivider}>·</span>
              <span style={styles.modalContextText}>Item {packet.itemNumber}</span>
            </div>
          </div>
          <button type="button" style={styles.iconButton} onClick={onClose}>
            X
          </button>
        </header>

        <div style={styles.modalBody}>
          <section style={styles.modalPhotoPane}>
            <div style={styles.sectionLabelRow}>
              <h3 style={styles.sectionLabel}>Photos</h3>
              <span style={styles.sectionMeta}>{item.photoUrls.length} total</span>
            </div>

            <div style={styles.modalHeroFrame}>
              {activePhotoUrl ? (
                <img
                  src={activePhotoUrl}
                  alt={`${item.label} photo ${activePhotoIndex + 1}`}
                  style={styles.modalHeroPhoto}
                />
              ) : (
                <div style={styles.modalMissingPhoto}>
                  <div style={styles.modalMissingPhotoTitle}>No photos available</div>
                  <div style={styles.modalMissingPhotoText}>This item has not received any local photos yet.</div>
                </div>
              )}
            </div>

            <div style={styles.modalThumbRow}>
              {item.photoUrls.length > 0 ? (
                item.photoUrls.map((photoUrl, index) => {
                  const selected = index === activePhotoIndex
                  return (
                    <button
                      key={`${item.packet.id}-${index}`}
                      type="button"
                      style={selected ? styles.modalThumbButtonActive : styles.modalThumbButton}
                      onClick={() => setActivePhotoIndex(index)}
                      aria-label={`Show photo ${index + 1}`}
                    >
                      <img src={photoUrl} alt="" style={styles.modalThumbImage} />
                      <span style={styles.modalThumbIndex}>{index + 1}</span>
                    </button>
                  )
                })
              ) : (
                <div style={styles.modalThumbEmpty}>No photo thumbnails to browse.</div>
              )}
            </div>

            {item.photoUrls.length > 0 ? (
              <div style={styles.modalPhotoCaption}>
                Showing photo {activePhotoIndex + 1} of {item.photoUrls.length}
              </div>
            ) : null}
          </section>

          <aside style={styles.modalSidebar}>
            <section style={styles.detailBlock}>
              <div style={styles.detailBlockHeader}>
                <div>
                  <div style={styles.detailBlockEyebrow}>Item</div>
                  <div style={styles.detailBlockTitle}>{item.label}</div>
                </div>
                <span style={statusBadgeStyle(status)}>{getListingStatusLabel(status)}</span>
              </div>
              <div style={styles.modalContextRow}>
                <span style={styles.modalContextText}>{storeName}</span>
                <span style={styles.modalContextDivider}>·</span>
                <span style={styles.modalContextText}>{batchName}</span>
                <span style={styles.modalContextDivider}>·</span>
                <span style={styles.modalContextText}>Item {packet.itemNumber}</span>
              </div>
            </section>

            <section style={styles.detailBlock}>
              <div style={styles.detailBlockHeader}>
                <div>
                  <div style={styles.detailBlockEyebrow}>Metadata</div>
                  <div style={styles.detailBlockTitle}>Readout</div>
                </div>
              </div>

              {hasMetadata ? (
                <div style={styles.metaGrid}>
                  {metadataFields.map((field) => (
                    <MetaRow key={field.label} label={field.label} value={field.value} wide={field.wide} />
                  ))}
                </div>
              ) : (
                <div style={styles.emptyDetailState}>No metadata has been added for this item.</div>
              )}
            </section>

            <section style={styles.detailBlock}>
              <div style={styles.detailBlockHeader}>
                <div>
                  <div style={styles.detailBlockEyebrow}>Actions</div>
                  <div style={styles.detailBlockTitle}>Listing status</div>
                </div>
              </div>
              <div style={styles.dragExportWrap}>
                <button
                  type="button"
                  style={dragExportPlan.canDrag ? styles.dragExportButton : styles.dragExportButtonDisabled}
                  draggable={dragExportPlan.canDrag}
                  onDragStart={handleDragStart}
                  disabled={!dragExportPlan.canDrag}
                  title={dragExportPlan.canDrag ? 'Drag to eBay image uploader' : 'Not ready for drag export'}
                >
                  <div style={styles.dragExportButtonTitle}>Drag ordered photos to eBay</div>
                  <div style={styles.dragExportButtonMeta}>
                    {dragExportPlan.canDrag
                      ? `${dragExportPlan.readyCount}/${dragExportPlan.total} photos ready for manual handoff`
                      : 'Disabled until all photos have listing-quality local blobs'}
                  </div>
                </button>
                <div style={styles.dragExportNote}>
                  Experimental manual handoff. Keep this source scoped to the item’s ordered photo set.
                </div>
                {dragExportPlan.warning ? (
                  <div style={styles.dragExportWarning}>{dragExportPlan.warning}</div>
                ) : null}
              </div>
              <ListingStatusControls currentStatus={status} busy={busy} onChange={onChangeStatus} />
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}

function ListingStatusControls({
  currentStatus,
  busy,
  onChange,
}: {
  currentStatus: ListingStatus | undefined
  busy: boolean
  onChange: (status: ListingStatus) => void
}) {
  const options: Array<{ status: ListingStatus; label: string }> = [
    { status: 'new', label: 'New / To list' },
    { status: 'listed', label: 'Listed' },
    { status: 'hold', label: 'Hold' },
    { status: 'needs_retake', label: 'Needs retake' },
  ]

  return (
    <div style={styles.statusControls}>
      {options.map((option) => {
        const selected = (currentStatus ?? 'new') === option.status
        return (
          <button
            key={option.status}
            type="button"
            style={selected ? styles.statusButtonActive : styles.statusButton}
            disabled={busy || selected}
            onClick={() => onChange(option.status)}
          >
            {busy && selected ? 'Saving...' : option.label}
          </button>
        )
      })}
    </div>
  )
}

function MetaRow({ label, value, wide }: { label: string; value: string | undefined; wide?: boolean }) {
  return (
    <div style={wide ? styles.metaFieldWide : styles.metaField}>
      <div style={styles.metaFieldLabel}>{label}</div>
      <div style={styles.metaFieldValue}>{value || '—'}</div>
    </div>
  )
}

function importStatusStyle(phase: ImportStatusPhase): CSSProperties {
  const base: CSSProperties = {
    margin: '0 0 12px',
    fontSize: '13px',
    borderRadius: '8px',
    padding: '8px 10px',
  }

  if (phase === 'error') {
    return { ...base, color: '#9f2525', background: '#fdecec' }
  }
  if (phase === 'success') {
    return { ...base, color: '#225c2a', background: '#eaf8ec' }
  }
  if (phase === 'checking') {
    return { ...base, color: '#3b4b83', background: '#edf2ff' }
  }
  return { ...base, color: '#5e6b84', background: '#eef2f7' }
}

function statusBadgeStyle(status: ListingStatus | undefined): CSSProperties {
  switch (status) {
    case 'listed':
      return {
        ...styles.statusBadge,
        color: '#225c2a',
        background: '#eaf8ec',
      }
    case 'hold':
      return {
        ...styles.statusBadge,
        color: '#7a5a12',
        background: '#fff4da',
      }
    case 'needs_retake':
      return {
        ...styles.statusBadge,
        color: '#9f2525',
        background: '#fdecec',
      }
    default:
      return {
        ...styles.statusBadge,
        color: '#3b4b83',
        background: '#edf2ff',
      }
  }
}

function getItemCardStyle(status: ListingStatus | undefined): CSSProperties {
  switch (status) {
    case 'listed':
      return styles.itemCardListed
    case 'hold':
      return styles.itemCardHold
    case 'needs_retake':
      return styles.itemCardNeedsRetake
    default:
      return styles.itemCard
  }
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f6f8fb',
    color: '#1e2430',
    padding: '28px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  loadingState: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#f6f8fb',
    color: '#1e2430',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '24px',
    textAlign: 'center',
  },
  authCard: {
    maxWidth: '460px',
    margin: '10vh auto 0',
    background: '#fff',
    border: '1px solid #d8deea',
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '30px',
    lineHeight: 1.2,
  },
  subtleText: {
    margin: 0,
    color: '#5e6b84',
    fontSize: '14px',
    lineHeight: 1.4,
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
  },
  input: {
    width: '100%',
    border: '1px solid #c9d2e3',
    borderRadius: '10px',
    fontSize: '16px',
    padding: '10px 12px',
    boxSizing: 'border-box',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '10px',
    background: '#2e5cff',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    padding: '10px 14px',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #c9d2e3',
    borderRadius: '10px',
    background: '#fff',
    color: '#1e2430',
    fontWeight: 600,
    fontSize: '14px',
    padding: '8px 12px',
    cursor: 'pointer',
  },
  infoText: {
    margin: 0,
    color: '#225c2a',
    background: '#eaf8ec',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
  },
  errorText: {
    margin: 0,
    color: '#9f2525',
    background: '#fdecec',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '24px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  storeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
    maxWidth: '900px',
  },
  storeGridTwo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
    gap: '14px',
    maxWidth: '760px',
  },
  storeCardButton: {
    border: '1px solid #d8deea',
    borderRadius: '14px',
    background: '#fff',
    textAlign: 'left',
    padding: '18px',
    cursor: 'pointer',
  },
  storeCardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  storeCardSubtitle: {
    fontSize: '13px',
    color: '#5e6b84',
    marginBottom: '8px',
  },
  storeCardCount: {
    fontSize: '14px',
    color: '#1e2430',
    fontWeight: 600,
  },
  storeCardMeta: {
    fontSize: '13px',
    color: '#5e6b84',
    marginTop: '4px',
  },
  emptyState: {
    border: '1px dashed #c9d2e3',
    borderRadius: '12px',
    background: '#fff',
    padding: '24px',
    maxWidth: '520px',
    display: 'grid',
    gap: '8px',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
  },
  itemGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
    gap: '12px',
  },
  itemCard: {
    border: '1px solid #d8deea',
    borderRadius: '12px',
    background: '#fff',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  itemCardListed: {
    border: '1px solid #9ec59d',
    borderRadius: '12px',
    background: '#f2fbf2',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  itemCardHold: {
    border: '1px solid #e8cb79',
    borderRadius: '12px',
    background: '#fffaf0',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  itemCardNeedsRetake: {
    border: '1px solid #f0b0b0',
    borderRadius: '12px',
    background: '#fff5f5',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardMainButton: {
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    padding: 0,
    cursor: 'pointer',
  },
  previewWrap: {
    position: 'relative',
    height: '150px',
    marginBottom: '10px',
  },
  previewThird: {
    position: 'absolute',
    inset: '8px 12px 0 0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '10px',
    opacity: 0.45,
  },
  previewSecond: {
    position: 'absolute',
    inset: '4px 6px 0 0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '10px',
    opacity: 0.7,
  },
  previewFront: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '10px',
    border: '1px solid #d8deea',
    background: '#f8faff',
  },
  previewPlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    border: '1px dashed #c9d2e3',
    borderRadius: '10px',
    background: '#f8faff',
    color: '#7d889d',
    fontSize: '13px',
  },
  itemTitle: {
    fontSize: '16px',
    fontWeight: 700,
  },
  itemMeta: {
    fontSize: '13px',
    color: '#5e6b84',
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '2px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  metadataChip: {
    display: 'inline-block',
    borderRadius: '999px',
    background: '#edf2ff',
    color: '#3b4b83',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  statusControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  statusButton: {
    border: '1px solid #c9d2e3',
    borderRadius: '999px',
    background: '#fff',
    color: '#1e2430',
    fontWeight: 700,
    fontSize: '12px',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  statusButtonActive: {
    border: '1px solid #2e5cff',
    borderRadius: '999px',
    background: '#edf2ff',
    color: '#2e5cff',
    fontWeight: 700,
    fontSize: '12px',
    padding: '6px 10px',
    cursor: 'default',
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(16, 24, 40, 0.5)',
    display: 'grid',
    placeItems: 'center',
    padding: '20px',
  },
  modal: {
    width: 'min(1120px, calc(100vw - 40px))',
    maxHeight: '92vh',
    overflow: 'auto',
    background: '#fff',
    borderRadius: '14px',
    border: '1px solid #d8deea',
    padding: '18px',
    boxShadow: '0 24px 80px rgba(16, 24, 40, 0.22)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '16px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '24px',
  },
  modalContextRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  },
  modalContextText: {
    fontSize: '12px',
    color: '#5e6b84',
    fontWeight: 600,
  },
  modalContextDivider: {
    color: '#aab3c6',
    fontSize: '12px',
  },
  modalBody: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.85fr)',
    gap: '18px',
    alignItems: 'start',
  },
  modalPhotoPane: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
  },
  modalSidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
  },
  detailBlock: {
    border: '1px solid #d8deea',
    borderRadius: '14px',
    background: '#fafdff',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
  },
  detailBlockEyebrow: {
    color: '#6b778d',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '2px',
  },
  detailBlockTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#1e2430',
    lineHeight: 1.2,
  },
  sectionLabelRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 800,
    color: '#1e2430',
  },
  sectionMeta: {
    fontSize: '12px',
    color: '#6b778d',
    fontWeight: 600,
  },
  modalHeroFrame: {
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid #d8deea',
    background: '#f8faff',
    aspectRatio: '4 / 3',
    minHeight: '420px',
  },
  modalHeroPhoto: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#f8faff',
    display: 'block',
  },
  modalMissingPhoto: {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
    padding: '24px',
    color: '#7d889d',
  },
  modalMissingPhotoTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#5e6b84',
    marginBottom: '4px',
  },
  modalMissingPhotoText: {
    fontSize: '13px',
    lineHeight: 1.5,
  },
  modalThumbRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
    gap: '10px',
  },
  modalThumbButton: {
    position: 'relative',
    border: '1px solid #d8deea',
    borderRadius: '12px',
    padding: '0',
    overflow: 'hidden',
    background: '#fff',
    cursor: 'pointer',
    aspectRatio: '1 / 1',
  },
  modalThumbButtonActive: {
    position: 'relative',
    border: '2px solid #2e5cff',
    borderRadius: '12px',
    padding: '0',
    overflow: 'hidden',
    background: '#fff',
    cursor: 'pointer',
    aspectRatio: '1 / 1',
  },
  modalThumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  modalThumbIndex: {
    position: 'absolute',
    left: '6px',
    bottom: '6px',
    borderRadius: '999px',
    background: 'rgba(16, 24, 40, 0.72)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    padding: '3px 6px',
  },
  modalThumbEmpty: {
    border: '1px dashed #c9d2e3',
    borderRadius: '12px',
    minHeight: '78px',
    display: 'grid',
    placeItems: 'center',
    color: '#7d889d',
    fontSize: '12px',
    background: '#f8faff',
    padding: '8px',
    textAlign: 'center',
  },
  modalPhotoCaption: {
    fontSize: '12px',
    color: '#6b778d',
    fontWeight: 600,
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  },
  metaField: {
    border: '1px solid #d8deea',
    borderRadius: '12px',
    background: '#fff',
    padding: '10px 12px',
    minWidth: 0,
  },
  metaFieldWide: {
    gridColumn: '1 / -1',
    border: '1px solid #d8deea',
    borderRadius: '12px',
    background: '#fff',
    padding: '10px 12px',
    minWidth: 0,
  },
  metaFieldLabel: {
    color: '#6b778d',
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  metaFieldValue: {
    color: '#1e2430',
    fontSize: '14px',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    userSelect: 'text',
  },
  emptyDetailState: {
    border: '1px dashed #c9d2e3',
    borderRadius: '12px',
    background: '#f8faff',
    color: '#6b778d',
    fontSize: '13px',
    lineHeight: 1.5,
    padding: '16px',
  },
  dragExportWrap: {
    display: 'grid',
    gap: '8px',
  },
  dragExportButton: {
    border: '1px solid #c9d2e3',
    borderRadius: '14px',
    background: 'linear-gradient(180deg, #ffffff 0%, #f4f7ff 100%)',
    padding: '14px',
    textAlign: 'left',
    cursor: 'grab',
    display: 'grid',
    gap: '6px',
  },
  dragExportButtonDisabled: {
    border: '1px solid #e1e6f1',
    borderRadius: '14px',
    background: '#f7f9fc',
    padding: '14px',
    textAlign: 'left',
    cursor: 'not-allowed',
    display: 'grid',
    gap: '6px',
    opacity: 0.82,
  },
  dragExportButtonTitle: {
    color: '#1e2430',
    fontSize: '14px',
    fontWeight: 800,
    lineHeight: 1.2,
  },
  dragExportButtonMeta: {
    color: '#5e6b84',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  dragExportNote: {
    color: '#6b778d',
    fontSize: '12px',
    lineHeight: 1.45,
  },
  dragExportWarning: {
    borderRadius: '10px',
    background: '#fff4da',
    color: '#7a5a12',
    padding: '8px 10px',
    fontSize: '12px',
    lineHeight: 1.4,
    border: '1px solid #f1d28a',
  },
  iconButton: {
    border: '1px solid #c9d2e3',
    background: '#fff',
    borderRadius: '8px',
    width: '34px',
    height: '34px',
    cursor: 'pointer',
  },
}
