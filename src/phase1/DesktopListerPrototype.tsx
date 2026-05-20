import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IndexedDbItemPacketStore, type ItemPacket, type ListingStatus } from '../adapters/itemPacket'
import { IndexedDbPhotoStore, type StoredPhoto } from '../adapters/localPhotoStore'
import { importRemoteBatchToLocal } from '../adapters/remoteImport'
import { calculateRetentionWindow, type RemoteRetentionMode } from '../adapters/retention'
import { IndexedDbWorkflowStore, type BatchRecord, type StoreRecord } from '../adapters/workflowStore'
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
    const blob = photo.thumbnailBlob ?? photo.blob
    acc[photo.id] = URL.createObjectURL(blob)
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

function toListingStatus(done: boolean): ListingStatus {
  return done ? 'listed' : 'new'
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

function formatImportStatusMessage(importedItems: number, errors: string[]): ImportStatus {
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
  return {
    phase: 'no-new',
    message: 'No new items',
  }
}

export function DesktopListerPrototype() {
  const { session, loading: authLoading, error: authError, signInWithPassword, signOut, configured: supabaseReady } = useSupabaseSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

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
      const [localItems, localPhotos] = await Promise.all([
        itemPacketStore.getAllItems(),
        photoStore.getAll(),
      ])

      const summary = await importRemoteBatchToLocal({
        client: supabase,
        store,
        batch,
        localItems,
        localPhotos,
        workflowStore,
        itemStore: itemPacketStore,
        photoStore,
      })

      await loadDesktopData({ silent: true })
      setImportStatus(formatImportStatusMessage(summary.importedItems, summary.errors))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setImportStatus({ phase: 'error', message: `Import failed: ${message}` })
    } finally {
      importInFlightRef.current = false
      setImportingRemote(false)
    }
  }, [loadDesktopData, session])

  useEffect(() => {
    if (!session || !selectedStoreId || !supabase) {
      return
    }
    void runRemoteImport(selectedStoreId)
  }, [selectedStoreId, session, runRemoteImport])

  useEffect(() => {
    if (!session || !selectedStoreId || !supabase) {
      return
    }

    const intervalId = window.setInterval(() => {
      void runRemoteImport(selectedStoreId)
    }, IMPORT_POLL_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedStoreId, session, runRemoteImport])

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

  const handleSignIn = useCallback(async () => {
    setSigningIn(true)
    setLoginError(null)
    setLoginMessage(null)
    try {
      await signInWithPassword(email, password)
      setLoginMessage('Signed in with password.')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : String(error))
    } finally {
      setSigningIn(false)
    }
  }, [email, password, signInWithPassword])

  const setItemDone = useCallback(async (item: ItemPacket, done: boolean) => {
    const status = toListingStatus(done)
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
      await itemPacketStore.updateItem(item.id, {
        listingStatus: status,
        listedAt: isListed ? now : undefined,
        remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
        remoteExpiresAt: retentionWindow.expiresAt || undefined,
      })

      for (const photoId of item.photoIds) {
        await photoStore.updatePhoto(photoId, {
          remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
          remoteExpiresAt: retentionWindow.expiresAt || undefined,
        }).catch(() => undefined)
      }

      if (session && supabase && item.remoteId) {
        const { error } = await supabase
          .from('items')
          .update({
            status,
            listed_at: isListed ? now : null,
            photo_retention_until: retentionWindow.expiresAt || null,
          })
          .eq('id', item.remoteId)

        if (error) {
          throw new Error(`Remote item update failed: ${error.message}`)
        }
      }

      await loadDesktopData()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setUpdatingItemId(null)
    }
  }, [batchesByStore, loadDesktopData, session])

  const toggleDone = useCallback(async (item: ItemPacket) => {
    const nextDone = !isDoneStatus(item.listingStatus)
    await setItemDone(item, nextDone)
  }, [setItemDone])

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
          <p style={styles.subtleText}>Sign in to continue.</p>
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
          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleSignIn}
            disabled={signingIn || !email.trim() || !password.trim()}
          >
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
          {authError ? <p style={styles.errorText}>{authError}</p> : null}
          {loginError ? <p style={styles.errorText}>{loginError}</p> : null}
          {loginMessage ? <p style={styles.infoText}>{loginMessage}</p> : null}
          <div style={styles.footerRow}>
            <a href="/?legacy=1" style={styles.footerLink}>Open legacy workspace</a>
          </div>
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
          <button type="button" style={styles.secondaryButton} onClick={() => signOut()}>
            Sign out
          </button>
        </header>

        {dataError ? <p style={styles.errorText}>{dataError}</p> : null}
        {actionError ? <p style={styles.errorText}>{actionError}</p> : null}

        {dataLoading ? (
          <p style={styles.subtleText}>Loading...</p>
        ) : storeViews.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No stores yet</p>
            <p style={styles.subtleText}>
              Import items in the legacy workspace, then return here to list them.
            </p>
            <a href="/?legacy=1" style={styles.footerLink}>Open legacy workspace</a>
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

        <footer style={styles.footerRow}>
          <a href="/?legacy=1" style={styles.footerLink}>Open legacy workspace</a>
        </footer>
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
                : 'New iOS uploads should appear here automatically after refresh.'}
          </p>
        </div>
      ) : (
        <section style={styles.itemGrid}>
          {storeItemViews.map((item) => {
            const done = isDoneStatus(item.packet.listingStatus)
            const busy = updatingItemId === item.packet.id
            return (
              <article key={item.packet.id} style={done ? styles.itemCardDone : styles.itemCard}>
                <button
                  type="button"
                  style={styles.cardMainButton}
                  onClick={() => setSelectedItemId(item.packet.id)}
                >
                  <StackedPreview photos={item.photoUrls} />
                  <div style={styles.itemTitle}>{item.label}</div>
                  <div style={styles.itemMeta}>{item.photoCount} photos</div>
                  {hasMetadata(item) ? <div style={styles.metadataChip}>metadata</div> : null}
                </button>
                <label style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={busy}
                    onChange={() => void toggleDone(item.packet)}
                  />
                  <span>{busy ? 'Saving...' : done ? 'Done' : 'Mark done'}</span>
                </label>
              </article>
            )
          })}
        </section>
      )}

      {selectedItem ? (
        <ItemDetailModal
          item={selectedItem}
          done={isDoneStatus(selectedItem.packet.listingStatus)}
          busy={updatingItemId === selectedItem.packet.id}
          onClose={() => setSelectedItemId(null)}
          onToggleDone={() => void toggleDone(selectedItem.packet)}
        />
      ) : null}

      <footer style={styles.footerRow}>
        <a href="/?legacy=1" style={styles.footerLink}>Open legacy workspace</a>
      </footer>
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
        <img style={styles.previewFront} src={front} alt="Item thumbnail" />
      ) : (
        <div style={styles.previewPlaceholder}>No photo</div>
      )}
    </div>
  )
}

function ItemDetailModal({
  item,
  done,
  busy,
  onClose,
  onToggleDone,
}: {
  item: DesktopItemView
  done: boolean
  busy: boolean
  onClose: () => void
  onToggleDone: () => void
}) {
  const packet = item.packet

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
          <h2 style={styles.modalTitle}>{item.label}</h2>
          <button type="button" style={styles.iconButton} onClick={onClose}>
            X
          </button>
        </header>

        <div style={styles.modalPhotoGrid}>
          {item.photoUrls.length > 0 ? (
            item.photoUrls.map((photoUrl, index) => (
              <img key={`${item.packet.id}-${index}`} src={photoUrl} alt={`${item.label} photo ${index + 1}`} style={styles.modalPhoto} />
            ))
          ) : (
            <div style={styles.modalEmptyPhoto}>No photos available.</div>
          )}
        </div>

        <dl style={styles.metaList}>
          <MetaRow label="SKU" value={packet.sku} />
          <MetaRow label="Weight" value={packet.weight} />
          <MetaRow label="Dimensions" value={packet.dimensions} />
          <MetaRow label="Notes" value={packet.note} />
        </dl>

        <label style={styles.checkboxRow}>
          <input type="checkbox" checked={done} disabled={busy} onChange={onToggleDone} />
          <span>{busy ? 'Saving...' : done ? 'Done' : 'Mark done'}</span>
        </label>
      </section>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <>
      <dt style={styles.metaLabel}>{label}</dt>
      <dd style={styles.metaValue}>{value || '—'}</dd>
    </>
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
  itemCardDone: {
    border: '1px solid #9ec59d',
    borderRadius: '12px',
    background: '#f2fbf2',
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
  metadataChip: {
    marginTop: '6px',
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
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 600,
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
    width: 'min(920px, 100%)',
    maxHeight: '90vh',
    overflow: 'auto',
    background: '#fff',
    borderRadius: '14px',
    border: '1px solid #d8deea',
    padding: '16px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '24px',
  },
  iconButton: {
    border: '1px solid #c9d2e3',
    background: '#fff',
    borderRadius: '8px',
    width: '34px',
    height: '34px',
    cursor: 'pointer',
  },
  modalPhotoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '10px',
    marginBottom: '14px',
  },
  modalPhoto: {
    width: '100%',
    aspectRatio: '1 / 1',
    objectFit: 'cover',
    borderRadius: '10px',
    border: '1px solid #d8deea',
    background: '#f8faff',
  },
  modalEmptyPhoto: {
    border: '1px dashed #c9d2e3',
    borderRadius: '10px',
    minHeight: '120px',
    display: 'grid',
    placeItems: 'center',
    color: '#7d889d',
    fontSize: '13px',
  },
  metaList: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '8px 12px',
    margin: '0 0 14px',
  },
  metaLabel: {
    margin: 0,
    fontWeight: 700,
    fontSize: '13px',
    color: '#4b5770',
  },
  metaValue: {
    margin: 0,
    fontSize: '14px',
    color: '#1e2430',
  },
  footerRow: {
    marginTop: '16px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  footerLink: {
    color: '#5e6b84',
    fontSize: '12px',
    textDecoration: 'none',
  },
}
