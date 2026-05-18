import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraPreview, CameraPreviewHandle } from '../components/CameraPreview'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { PhotoDetailModal } from '../components/PhotoDetailModal'
import { PhotoList } from '../components/PhotoList'
import { CanvasImageProcessingAdapter, OutputRatio, loadDefaultRatioFromStorage, saveDefaultRatioToStorage } from '../adapters/imageProcessing'
import { IndexedDbPhotoStore, StoredPhoto } from '../adapters/localPhotoStore'
import { IndexedDbItemPacketStore, ItemPacket, ListingStatus } from '../adapters/itemPacket'
import { syncBatchToSupabase, BatchUploadProgress } from '../adapters/supabaseUpload'
import { attachOrderedPhotosToItem, getItemReadiness, sortItems } from '../adapters/itemHelpers'
import { probeSecureContext, SecureContextInfo } from '../adapters/secureContext'
import { BatchRecord, IndexedDbWorkflowStore, StoreRecord } from '../adapters/workflowStore'
import { CameraCapabilities, CaptureDiagnostics } from '../adapters/camera'
import { supabase, supabaseConfig } from '../lib/supabase'
import { APP_NAME, SUPABASE_STORAGE_BUCKET } from '../lib/appConfig'
import { useSupabaseSession } from '../lib/useSupabaseSession'

const imageProcessor = new CanvasImageProcessingAdapter()
const photoStore = new IndexedDbPhotoStore()
const itemPacketStore = new IndexedDbItemPacketStore()
const workflowStore = new IndexedDbWorkflowStore()
const secureContextInfo: SecureContextInfo = probeSecureContext()

type CameraState = 'idle' | 'starting' | 'active' | 'stopped' | 'error'
type QueueFilter = 'all' | ListingStatus

const s: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    gap: 16,
    padding: '12px 0 24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 16,
    padding: '0 12px',
  },
  panel: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 14,
    padding: 14,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#f2f2f2',
  },
  subtitle: {
    fontSize: 12,
    color: '#8b8b8b',
    marginTop: 4,
  },
  row: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    color: '#8b8b8b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#171717',
    color: '#eee',
    fontSize: 14,
  },
  button: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#1c1c1c',
    color: '#eee',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  buttonPrimary: {
    background: '#f2f2f2',
    color: '#111',
    border: '1px solid #f2f2f2',
  },
  buttonDanger: {
    background: 'transparent',
    color: '#f87171',
    border: '1px solid #7f1d1d',
  },
  buttonSmall: {
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 8,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  stat: {
    background: '#171717',
    border: '1px solid #252525',
    borderRadius: 10,
    padding: 10,
  },
  statValue: {
    fontSize: 18,
    color: '#f2f2f2',
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    color: '#8b8b8b',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#a8a8a8',
    marginBottom: 10,
  },
  queueItem: {
    display: 'flex',
    gap: 12,
    border: '1px solid #242424',
    borderRadius: 12,
    background: '#151515',
    padding: 10,
    marginBottom: 10,
  },
  queueThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    objectFit: 'cover',
    background: '#202020',
    flexShrink: 0,
  },
  queueThumbFallback: {
    width: 72,
    height: 72,
    borderRadius: 10,
    background: '#202020',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    flexShrink: 0,
  },
  queueContent: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'baseline',
    marginBottom: 4,
  },
  queueNumber: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f2f2f2',
  },
  queueBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeNew: {
    background: '#1f2937',
    color: '#93c5fd',
  },
  badgeListed: {
    background: '#11341e',
    color: '#4ade80',
  },
  badgeHold: {
    background: '#3a2510',
    color: '#fbbf24',
  },
  badgeRetake: {
    background: '#3a1a1a',
    color: '#f87171',
  },
  badgeUnknown: {
    background: '#1f1f1f',
    color: '#9ca3af',
  },
  queueMeta: {
    fontSize: 12,
    color: '#8b8b8b',
    lineHeight: 1.5,
  },
  queueActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filterButton: {
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid #2b2b2b',
    background: '#161616',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 12,
  },
  filterButtonActive: {
    background: '#e5e7eb',
    color: '#111',
    borderColor: '#e5e7eb',
  },
  authPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    background: '#151515',
    display: 'grid',
    gap: 10,
  },
  authGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: 8,
    alignItems: 'center',
  },
  authLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 12,
    color: '#a8a8a8',
    flexWrap: 'wrap',
  },
  progressBox: {
    padding: 10,
    borderRadius: 10,
    border: '1px solid #27303a',
    background: '#111827',
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 1.5,
  },
  empty: {
    fontSize: 13,
    color: '#777',
    padding: 16,
    border: '1px dashed #2b2b2b',
    borderRadius: 12,
    background: '#141414',
  },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
    gap: 16,
    alignItems: 'start',
  },
}

export function Phase1Screen() {
  const cameraRef = useRef<CameraPreviewHandle>(null)
  const { session, loading: authLoading, error: authError, sendMagicLink, signOut, configured: supabaseReady } = useSupabaseSession()
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null)
  const [captureErrors, setCaptureErrors] = useState<string[]>([])
  const [storageErrors, setStorageErrors] = useState<string[]>([])
  const [allPhotos, setAllPhotos] = useState<StoredPhoto[]>([])
  const [allItems, setAllItems] = useState<ItemPacket[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [batches, setBatches] = useState<BatchRecord[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [currentItem, setCurrentItem] = useState<ItemPacket | null>(null)
  const [itemSku, setItemSku] = useState('')
  const [itemNote, setItemNote] = useState('')
  const [itemWeight, setItemWeight] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Phase 1 shell ready')
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null)
  const [selectedRatio, setSelectedRatio] = useState<OutputRatio>(() => loadDefaultRatioFromStorage())
  const [lastCaptureDiagnostics, setLastCaptureDiagnostics] = useState<CaptureDiagnostics | null>(null)
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all')
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState<BatchUploadProgress | null>(null)
  const [uploading, setUploading] = useState(false)

  const loadData = useCallback(async () => {
    const [storesData, photosData, itemsData] = await Promise.all([
      workflowStore.getAllStores(),
      photoStore.getAll(),
      itemPacketStore.getAllItems(),
    ])

    setStores(storesData)
    setAllPhotos(photosData)
    setAllItems(itemsData)
  }, [])

  const reloadBatches = useCallback(async (storeId: string) => {
    const batchesData = await workflowStore.getBatches(storeId)
    setBatches(batchesData)
  }, [])

  useEffect(() => {
    async function bootstrap() {
      try {
        const store = await workflowStore.ensureDefaultStore()
        const batch = await workflowStore.ensureDefaultBatch(store.id)
        await loadData()
        setSelectedStoreId(store.id)
        setSelectedBatchId(batch.id)
        await reloadBatches(store.id)
        const current = await itemPacketStore.getCurrentItem(store.id, batch.id)
        setCurrentItem(current)
        if (current) {
          setItemSku(current.sku || '')
          setItemNote(current.note || '')
          setItemWeight(current.weight || '')
        }
        setStatusMsg(`Ready on ${store.name} / ${batch.name}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setStorageErrors((prev) => [...prev, `Bootstrap failed: ${msg}`])
      }
    }

    bootstrap()
  }, [loadData, reloadBatches])

  useEffect(() => {
    if (!selectedStoreId) return
    reloadBatches(selectedStoreId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Batch load failed: ${msg}`])
    })
  }, [reloadBatches, selectedStoreId])

  useEffect(() => {
    if (!selectedStoreId || !selectedBatchId) return
    itemPacketStore.getCurrentItem(selectedStoreId, selectedBatchId).then((item) => {
      setCurrentItem(item)
      if (!item) {
        setItemSku('')
        setItemNote('')
        setItemWeight('')
        return
      }
      setItemSku(item.sku || '')
      setItemNote(item.note || '')
      setItemWeight(item.weight || '')
    })
  }, [selectedBatchId, selectedStoreId])

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing || !selectedStoreId || !selectedBatchId) return
    setCapturing(true)
    setStatusMsg('Capturing…')

    try {
      const frame = await cameraRef.current.captureFrame()
      const processed = await imageProcessor.process(frame.blob, frame.capturedAt, selectedRatio, frame.width, frame.height)
      const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const photoRecord = {
        id,
        blob: processed.blob,
        mimeType: processed.mimeType,
        size: processed.size,
        capturedAt: processed.capturedAt,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        outputWidth: processed.outputWidth,
        outputHeight: processed.outputHeight,
        originalBlob: frame.blob,
        originalMimeType: frame.diagnostics?.originalMimeType || frame.blob.type,
        originalSize: frame.blob.size,
        originalWidth: frame.width,
        originalHeight: frame.height,
        thumbnailBlob: processed.thumbnailBlob,
        thumbnailSize: processed.thumbnailSize,
        thumbnailWidth: processed.thumbnailWidth,
        thumbnailHeight: processed.thumbnailHeight,
        ratio: processed.ratio,
      }

      const stored = await photoStore.save(photoRecord)

      let item = currentItem
      if (!item) {
        item = await itemPacketStore.createItem(selectedStoreId, selectedBatchId)
        setCurrentItem(item)
      }

      await itemPacketStore.addItemPhoto(item.id, id)
      const itemWithMetadata = {
        ...item,
        photoIds: [...item.photoIds, id],
        updatedAt: new Date().toISOString(),
      }
      setCurrentItem(itemWithMetadata)
      await itemPacketStore.updateItemMetadata(item.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
      })

      if (frame.diagnostics) {
        setLastCaptureDiagnostics({
          ...frame.diagnostics,
          captureMethod: frame.diagnostics.captureMethod,
          processedWidth: processed.outputWidth,
          processedHeight: processed.outputHeight,
          processedByteSize: processed.size,
          selectedRatio,
        })
      }

      setAllPhotos((prev) => [...prev, stored])
      await loadData()
      setStatusMsg(`Captured ${frame.width}x${frame.height} for Item ${itemWithMetadata.itemNumber}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCaptureErrors((prev) => [...prev, `Capture failed: ${msg}`])
      setStatusMsg('Capture failed')
    } finally {
      setCapturing(false)
    }
  }, [capturing, currentItem, itemNote, itemSku, itemWeight, loadData, selectedBatchId, selectedRatio, selectedStoreId])

  const handleRatioChange = useCallback((ratio: OutputRatio) => {
    setSelectedRatio(ratio)
    saveDefaultRatioToStorage(ratio)
  }, [])

  const handleStoreChange = useCallback(async (storeId: string) => {
    const store = stores.find((entry) => entry.id === storeId) || (await workflowStore.ensureDefaultStore())
    const batchesForStore = await workflowStore.getBatches(store.id)
    const batch = batchesForStore.find((entry) => entry.status === 'active') || (await workflowStore.ensureDefaultBatch(store.id))
    setSelectedStoreId(store.id)
    setSelectedBatchId(batch.id)
    setBatches(batchesForStore.length > 0 ? batchesForStore : [batch])
  }, [stores])

  const handleCreateStore = useCallback(async () => {
    const name = window.prompt('Store name', 'New Store')
    if (!name?.trim()) return
    const shortCode = window.prompt('Short code', name.trim().slice(0, 3).toUpperCase()) || name.trim().slice(0, 3).toUpperCase()
    const store = await workflowStore.createStore(name.trim(), shortCode.trim() || 'NEW')
    const batch = await workflowStore.ensureDefaultBatch(store.id)
    await loadData()
    setSelectedStoreId(store.id)
    setSelectedBatchId(batch.id)
    setStatusMsg(`Created ${store.name}`)
  }, [loadData])

  const handleCreateBatch = useCallback(async () => {
    if (!selectedStoreId) return
    const name = window.prompt('Batch name', `Batch ${new Date().toLocaleDateString()}`)
    if (!name?.trim()) return
    const batch = await workflowStore.createBatch(selectedStoreId, name.trim())
    setSelectedBatchId(batch.id)
    await reloadBatches(selectedStoreId)
    setStatusMsg(`Created ${batch.name}`)
  }, [reloadBatches, selectedStoreId])

  const handleDoneNext = useCallback(async () => {
    if (!currentItem) return
    try {
      await itemPacketStore.updateItemMetadata(currentItem.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
      })
      await itemPacketStore.finalizeItem(currentItem.id)
      const next = await itemPacketStore.createItem(selectedStoreId, selectedBatchId)
      setCurrentItem(next)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      await loadData()
      setStatusMsg(`Saved Item ${currentItem.itemNumber} and started Item ${next.itemNumber}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Done/Next failed: ${msg}`])
    }
  }, [currentItem, itemNote, itemSku, itemWeight, loadData, selectedBatchId, selectedStoreId])

  const handleReset = useCallback(async () => {
    try {
      await photoStore.clearAll()
      await itemPacketStore.clearAll()
      const store = await workflowStore.ensureDefaultStore()
      const batch = await workflowStore.ensureDefaultBatch(store.id)
      await loadData()
      setSelectedStoreId(store.id)
      setSelectedBatchId(batch.id)
      setCurrentItem(null)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      setStatusMsg('Phase 1 data reset')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Reset failed: ${msg}`])
    }
  }, [loadData])

  const handleSendMagicLink = useCallback(async () => {
    try {
      setAuthMessage('')
      await sendMagicLink(authEmail)
      setAuthMessage(`Magic link sent to ${authEmail.trim()}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthMessage(`Auth failed: ${msg}`)
    }
  }, [authEmail, sendMagicLink])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      setAuthMessage('Signed out')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthMessage(`Sign out failed: ${msg}`)
    }
  }, [signOut])

  const handleSyncBatch = useCallback(async () => {
    if (!supabase || !session || uploading) {
      return
    }

    const store = stores.find((entry) => entry.id === selectedStoreId)
    const batch = batches.find((entry) => entry.id === selectedBatchId)

    if (!store || !batch) {
      setStorageErrors((prev) => [...prev, 'Sync failed: selected store or batch is missing'])
      return
    }

    setUploading(true)
    setUploadProgress({
      stage: 'idle',
      message: 'Preparing batch sync',
    })

    try {
      const result = await syncBatchToSupabase({
        client: supabase,
        store,
        batch,
        items: allItems,
        photos: allPhotos,
        itemStore: itemPacketStore,
        photoStore,
        bucket: SUPABASE_STORAGE_BUCKET,
        onProgress: setUploadProgress,
      })

      await loadData()
      setStatusMsg(`Synced ${result.uploadedItems} item${result.uploadedItems === 1 ? '' : 's'} to Supabase`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Sync failed: ${msg}`])
      setUploadProgress({
        stage: 'error',
        message: `Sync failed: ${msg}`,
      })
    } finally {
      setUploading(false)
    }
  }, [allItems, allPhotos, batches, loadData, photoStore, selectedBatchId, selectedStoreId, session, stores, uploading])

  const queueItems = useMemo(() => {
    const items = allItems.filter((item) => item.storeId === selectedStoreId && item.batchId === selectedBatchId)
    const filtered = queueFilter === 'all' ? items : items.filter((item) => (item.listingStatus || 'new') === queueFilter)
    return sortItems(filtered, 'newest-first')
  }, [allItems, queueFilter, selectedBatchId, selectedStoreId])

  const queueStats = useMemo(() => {
    const items = allItems.filter((item) => item.storeId === selectedStoreId && item.batchId === selectedBatchId)
    const byStatus = {
      new: items.filter((item) => (item.listingStatus || 'new') === 'new').length,
      listed: items.filter((item) => item.listingStatus === 'listed').length,
      hold: items.filter((item) => item.listingStatus === 'hold').length,
      needs_retake: items.filter((item) => item.listingStatus === 'needs_retake').length,
    }
    return {
      itemCount: items.length,
      photoCount: items.reduce((sum, item) => sum + item.photoIds.length, 0),
      readyCount: items.filter((item) => getItemReadiness(item, allPhotos).readyForHandoff).length,
      ...byStatus,
    }
  }, [allItems, allPhotos, selectedBatchId, selectedStoreId])

  const currentItemPhotos = useMemo(() => {
    if (!currentItem) return []
    return allPhotos.filter((photo) => currentItem.photoIds.includes(photo.id))
  }, [allPhotos, currentItem])

  return (
    <div style={s.screen}>
      <div style={{ ...s.panel, margin: '0 12px' }}>
        <div style={s.header}>
          <div>
            <div style={s.title}>Phase 1 capture + queue</div>
            <div style={s.subtitle}>
              {APP_NAME} connected to Supabase bucket `{SUPABASE_STORAGE_BUCKET}` with store/batch queue scaffolding.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...s.button, ...s.buttonDanger }} onClick={handleReset}>Reset</button>
            <button style={{ ...s.button, ...s.buttonPrimary }} onClick={handleCreateStore}>New Store</button>
            <button style={s.button} onClick={handleCreateBatch} disabled={!selectedStoreId}>New Batch</button>
            <button
              style={{ ...s.button, ...s.buttonPrimary }}
              onClick={handleSyncBatch}
              disabled={!supabaseReady || !session || uploading || !selectedStoreId || !selectedBatchId}
            >
              {uploading ? 'Syncing…' : 'Sync Batch'}
            </button>
          </div>
        </div>

        <div style={s.split}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={s.label}>Store</div>
              <select style={s.select} value={selectedStoreId} onChange={(e) => handleStoreChange(e.target.value)}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name} ({store.shortCode})</option>
                ))}
              </select>
            </div>
            <div>
              <div style={s.label}>Batch</div>
              <select style={s.select} value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </div>
            <div style={s.statGrid}>
              <div style={s.stat}><div style={s.statValue}>{queueStats.itemCount}</div><div style={s.statLabel}>Items in batch</div></div>
              <div style={s.stat}><div style={s.statValue}>{queueStats.photoCount}</div><div style={s.statLabel}>Photos in batch</div></div>
              <div style={s.stat}><div style={s.statValue}>{queueStats.readyCount}</div><div style={s.statLabel}>Ready for handoff</div></div>
              <div style={s.stat}><div style={s.statValue}>{queueStats.listed}</div><div style={s.statLabel}>Listed</div></div>
            </div>
          </div>

          <div>
            <div style={s.label}>Capture ratio</div>
            <div style={{ ...s.row, marginBottom: 12 }}>
              {(['full', '1:1', '4:3', '16:9'] as OutputRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  style={{
                    ...s.button,
                    ...(selectedRatio === ratio ? s.buttonPrimary : {}),
                    flex: 1,
                  }}
                  onClick={() => handleRatioChange(ratio)}
                >
                  {ratio === 'full' ? 'Full' : ratio}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8b8b8b', lineHeight: 1.6 }}>
              The camera path is still the Phase 0 implementation. Phase 1 adds store/batch context and queue state around it.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: supabaseConfig.ready ? '#4ade80' : '#f59e0b' }}>
          Supabase client: {supabaseConfig.ready ? 'configured' : 'missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'}
        </div>
        <div style={s.authPanel}>
          <div style={s.authLine}>
            <span>Supabase auth</span>
            <span>
              {authLoading
                ? 'loading session'
                : session
                  ? `signed in as ${session.user.email || session.user.id}`
                  : 'signed out'}
            </span>
          </div>
          {authError && <div style={{ fontSize: 12, color: '#f87171' }}>{authError}</div>}
          {authMessage && <div style={{ fontSize: 12, color: '#93c5fd' }}>{authMessage}</div>}
          {!supabaseReady ? (
            <div style={{ fontSize: 12, color: '#f59e0b' }}>
              Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable auth and upload.
            </div>
          ) : session ? (
            <div style={s.authGrid}>
              <div style={{ fontSize: 12, color: '#a8a8a8' }}>
                Ready to sync as {session.user.email || session.user.id}
              </div>
              <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSyncBatch} disabled={uploading}>
                {uploading ? 'Syncing…' : 'Upload Batch'}
              </button>
              <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          ) : (
            <div style={s.authGrid}>
              <input
                style={s.select}
                placeholder="Email for magic link"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                type="email"
              />
              <button
                style={{ ...s.button, ...s.buttonPrimary }}
                onClick={handleSendMagicLink}
                disabled={!authEmail.trim()}
              >
                Send link
              </button>
              <button
                style={s.button}
                onClick={handleSyncBatch}
                disabled
                title="Sign in to enable upload"
              >
                Upload Batch
              </button>
            </div>
          )}
          {uploadProgress && (
            <div style={s.progressBox}>
              <div style={{ textTransform: 'uppercase', letterSpacing: 0.7, fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                Sync status
              </div>
              <div>{uploadProgress.message}</div>
              {(uploadProgress.itemCount !== undefined || uploadProgress.photoCount !== undefined) && (
                <div style={{ marginTop: 4, color: '#94a3b8' }}>
                  {uploadProgress.itemIndex !== undefined && uploadProgress.itemCount !== undefined && (
                    <div>Item {uploadProgress.itemIndex} / {uploadProgress.itemCount}</div>
                  )}
                  {uploadProgress.photoIndex !== undefined && uploadProgress.photoCount !== undefined && (
                    <div>Photo {uploadProgress.photoIndex} / {uploadProgress.photoCount}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={s.shell}>
        <div style={s.panel}>
          <CameraPreview
            ref={cameraRef}
            onError={(msg) => {
              setCameraState('error')
              setCaptureErrors((prev) => [...prev, msg])
            }}
            onStarted={() => {
              setCameraState('active')
              const caps = cameraRef.current?.getCapabilities() ?? null
              const dims = cameraRef.current?.getVideoDimensions() ?? null
              if (caps && dims) {
                setCapabilities({
                  ...caps,
                  trackSettings: caps.trackSettings
                    ? {
                        ...caps.trackSettings,
                        width: caps.trackSettings.width ?? dims.videoWidth,
                        height: caps.trackSettings.height ?? dims.videoHeight,
                      }
                    : {
                        width: dims.videoWidth,
                        height: dims.videoHeight,
                        aspectRatio: undefined,
                        facingMode: undefined,
                        deviceId: undefined,
                        zoom: undefined,
                      },
                })
              } else {
                setCapabilities(caps)
              }
              setStatusMsg('Camera active')
            }}
            onStopped={() => setCameraState('stopped')}
            ratio={selectedRatio}
          />

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentItem && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#a8a8a8' }}>
                <span>Item {currentItem.itemNumber}</span>
                <span>{currentItem.photoIds.length} photo{currentItem.photoIds.length === 1 ? '' : 's'}</span>
              </div>
            )}

            <div style={{ fontSize: 12, color: '#8b8b8b' }}>{statusMsg}</div>

            <button
              style={{ ...s.button, ...s.buttonPrimary, padding: '18px 12px', fontSize: 18 }}
              disabled={capturing || cameraState !== 'active' || !selectedStoreId || !selectedBatchId}
              onClick={handleCapture}
            >
              {capturing ? 'Capturing…' : '⊙ Capture'}
            </button>

            <button
              style={s.button}
              disabled={!currentItem || currentItem.photoIds.length === 0}
              onClick={handleDoneNext}
            >
              Done / Next Item
            </button>

            <div style={{ display: 'grid', gap: 8 }}>
              <input
                style={s.select}
                placeholder="SKU (optional)"
                value={itemSku}
                onChange={(e) => setItemSku(e.target.value)}
              />
              <input
                style={s.select}
                placeholder="Note (optional)"
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
              />
              <input
                style={s.select}
                placeholder="Weight (optional)"
                value={itemWeight}
                onChange={(e) => setItemWeight(e.target.value)}
              />
            </div>

            <PhotoList photos={currentItemPhotos} onPhotoClick={(photo) => setSelectedPhoto(photo)} />
          </div>

          <DiagnosticsPanel
            cameraState={cameraState}
            capabilities={capabilities}
            captureErrors={captureErrors}
            storageErrors={storageErrors}
            secureContext={secureContextInfo}
            lastCaptureDiagnostics={lastCaptureDiagnostics}
          />
        </div>

        <div style={s.panel}>
          <div style={s.sectionTitle}>Batch queue</div>
          <div style={s.filterRow}>
            {(['all', 'new', 'listed', 'hold', 'needs_retake'] as QueueFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setQueueFilter(filter)}
                style={{
                  ...s.filterButton,
                  ...(queueFilter === filter ? s.filterButtonActive : {}),
                }}
              >
                {filter === 'needs_retake' ? 'Needs retake' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {queueItems.length === 0 ? (
            <div style={s.empty}>
              No items in this batch yet. Capture an item to start the queue.
            </div>
          ) : (
            queueItems.map((item) => {
              const fullItem = attachOrderedPhotosToItem(item, allPhotos)
              const readiness = getItemReadiness(item, allPhotos)
              const coverPhoto = fullItem.coverPhoto
              return (
                <QueueCard
                  key={item.id}
                  item={item}
                  readiness={readiness}
                  coverPhoto={coverPhoto}
                  onPhotoClick={(photo) => setSelectedPhoto(photo)}
                  onUpdateStatus={async (status) => {
                    await itemPacketStore.setListingStatus(item.id, status)
                    await loadData()
                  }}
                />
              )
            })
          )}
        </div>
      </div>

      <PhotoDetailModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  )
}

function QueueCard({
  item,
  readiness,
  coverPhoto,
  onPhotoClick,
  onUpdateStatus,
}: {
  item: ItemPacket
  readiness: ReturnType<typeof getItemReadiness>
  coverPhoto: StoredPhoto | null
  onPhotoClick?: (photo: StoredPhoto) => void
  onUpdateStatus: (status: ListingStatus) => Promise<void>
}) {
  const badgeStyle =
    item.listingStatus === 'listed'
      ? s.badgeListed
      : item.listingStatus === 'hold'
        ? s.badgeHold
        : item.listingStatus === 'needs_retake'
          ? s.badgeRetake
          : s.badgeNew

  return (
    <div style={s.queueItem}>
      <QueueThumb photo={coverPhoto} onClick={onPhotoClick} />
      <div style={s.queueContent}>
        <div style={s.queueTitle}>
          <div style={s.queueNumber}>Item {item.itemNumber}</div>
          <span style={{ ...s.queueBadge, ...badgeStyle }}>
            {item.listingStatus || 'new'}
          </span>
        </div>
        <div style={s.queueMeta}>
          {item.photoIds.length} photo{item.photoIds.length === 1 ? '' : 's'} • {readiness.readyForHandoff ? 'ready' : 'needs info'}
          <br />
          Upload: {item.uploadStatus || 'local'}
          <br />
          {item.note ? `Note: ${item.note}` : 'Note missing'}
          <br />
          {item.sku ? `SKU: ${item.sku}` : 'SKU missing'}
          <br />
          {item.weight ? `Weight: ${item.weight}` : 'Weight missing'}
        </div>
        <div style={s.queueActions}>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('new')}>New</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('listed')}>Listed</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('hold')}>Hold</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('needs_retake')}>Needs retake</button>
        </div>
      </div>
    </div>
  )
}

function QueueThumb({ photo, onClick }: { photo: StoredPhoto | null; onClick?: (photo: StoredPhoto) => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) {
      setUrl(null)
      return
    }

    const blob = photo.thumbnailBlob || photo.blob
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])

  if (!photo) {
    return <div style={s.queueThumbFallback}>📷</div>
  }

  return url ? (
    <img
      src={url}
      alt={`Item ${photo.id}`}
      style={{ ...s.queueThumb, cursor: onClick ? 'pointer' : 'default' }}
      onClick={() => onClick?.(photo)}
    />
  ) : (
    <div style={s.queueThumbFallback} />
  )
}
