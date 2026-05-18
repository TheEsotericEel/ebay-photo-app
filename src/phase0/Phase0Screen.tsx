import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraPreview, CameraPreviewHandle } from '../components/CameraPreview'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { PhotoList } from '../components/PhotoList'
import { PhotoDetailModal } from '../components/PhotoDetailModal'
import { CanvasImageProcessingAdapter, OutputRatio, loadDefaultRatioFromStorage, saveDefaultRatioToStorage } from '../adapters/imageProcessing'
import { IndexedDbPhotoStore, StoredPhoto } from '../adapters/localPhotoStore'
import { IndexedDbItemPacketStore, ItemPacket } from '../adapters/itemPacket'
import { CameraCapabilities } from '../adapters/camera'
import { CaptureDiagnostics } from '../adapters/camera'
import { probeSecureContext, SecureContextInfo } from '../adapters/secureContext'

const imageProcessor = new CanvasImageProcessingAdapter()
const photoStore = new IndexedDbPhotoStore()
const itemPacketStore = new IndexedDbItemPacketStore()
const secureContextInfo: SecureContextInfo = probeSecureContext()

type CameraState = 'idle' | 'starting' | 'active' | 'stopped' | 'error'

const s: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '0 0 24px',
    maxWidth: 480,
    margin: '0 auto',
    gap: 0,
  },
  controls: {
    padding: '0 12px',
  },
  btn: {
    padding: '14px 0',
    borderRadius: 8,
    border: 'none',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 10,
  },
  captureBtn: {
    background: '#fff',
    color: '#111',
  },
  captureBtnDisabled: {
    background: '#333',
    color: '#666',
    cursor: 'not-allowed',
  },
  clearBtn: {
    background: 'transparent',
    color: '#c0392b',
    border: '1px solid #c0392b',
    marginTop: 8,
  },
  statusMsg: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    minHeight: 18,
    padding: '0 12px',
  },
}

export function Phase0Screen() {
  const cameraRef = useRef<CameraPreviewHandle>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null)
  const [captureErrors, setCaptureErrors] = useState<string[]>([])
  const [storageErrors, setStorageErrors] = useState<string[]>([])
  const [photos, setPhotos] = useState<StoredPhoto[]>([])
  const [capturing, setCapturing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [lastCaptureDiagnostics, setLastCaptureDiagnostics] = useState<CaptureDiagnostics | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null)
  const [selectedRatio, setSelectedRatio] = useState<OutputRatio>(() => {
    // Load default ratio from localStorage using helper
    return loadDefaultRatioFromStorage()
  })
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  // Item packet state
  const [currentItem, setCurrentItem] = useState<ItemPacket | null>(null)
  const [itemSku, setItemSku] = useState('')
  const [itemNote, setItemNote] = useState('')
  const [itemWeight, setItemWeight] = useState('')
  const [showMetadata, setShowMetadata] = useState(false)

  // Load persisted photos and current item on mount
  useEffect(() => {
    photoStore
      .getAll()
      .then((all) => setPhotos(all))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setStorageErrors((prev) => [...prev, `Load failed: ${msg}`])
      })

    // Load or create current draft item
    itemPacketStore
      .getCurrentItem()
      .then((item) => {
        if (item) {
          setCurrentItem(item)
          setItemSku(item.sku || '')
          setItemNote(item.note || '')
          setItemWeight(item.weight || '')
        } else {
          // Create first item if none exists
          return itemPacketStore.createItem().then((newItem) => {
            setCurrentItem(newItem)
          })
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setStorageErrors((prev) => [...prev, `Item load failed: ${msg}`])
      })
  }, [])

  const handleCameraStarted = useCallback(() => {
    setCameraState('active')
    setStatusMsg('Camera active')
    // Probe capabilities + video dimensions after camera starts
    const caps = cameraRef.current?.getCapabilities() ?? null
    const dims = cameraRef.current?.getVideoDimensions() ?? null
    if (caps && dims) {
      const ts = caps.trackSettings
      setCapabilities({
        ...caps,
        trackSettings: ts
          ? {
              ...ts,
              width: ts.width ?? (dims.videoWidth || undefined),
              height: ts.height ?? (dims.videoHeight || undefined),
            }
          : {
              width: dims.videoWidth || undefined,
              height: dims.videoHeight || undefined,
              aspectRatio: undefined,
              facingMode: undefined,
              deviceId: undefined,
              zoom: undefined,
              torch: undefined,
              focusMode: undefined,
              focusDistance: undefined,
              exposureMode: undefined,
              exposureTime: undefined,
              exposureCompensation: undefined,
              whiteBalanceMode: undefined,
              brightness: undefined,
              contrast: undefined,
              saturation: undefined,
              sharpness: undefined,
              iso: undefined,
              frameRate: undefined,
            },
      })
    } else {
      setCapabilities(caps)
    }
  }, [])

  const handleCameraStopped = useCallback(() => {
    setCameraState('stopped')
  }, [])

  const handleCameraError = useCallback((msg: string) => {
    setCameraState('error')
    setCaptureErrors((prev) => [...prev, msg])
  }, [])

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return
    setCapturing(true)
    setStatusMsg('Capturing…')

    // Use ref to get current values and avoid stale closures
    const currentRatio = selectedRatio
    const item = currentItem

    try {
      const frame = await cameraRef.current.captureFrame()
      
      // Process image with selected ratio
      const processed = await imageProcessor.process(
        frame.blob,
        frame.capturedAt,
        currentRatio,
        frame.width,
        frame.height,
      )

      const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      
      // Build photo record with original high-res capture + processed output
      const photoRecord: Omit<StoredPhoto, 'savedAt'> = {
        id,
        blob: processed.blob,
        mimeType: processed.mimeType,
        size: processed.size,
        capturedAt: processed.capturedAt,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        outputWidth: processed.outputWidth,
        outputHeight: processed.outputHeight,
        // Store original high-res capture separately
        originalBlob: frame.blob,
        originalMimeType: frame.diagnostics?.originalMimeType || frame.blob.type,
        originalSize: frame.blob.size,
        originalWidth: frame.width,
        originalHeight: frame.height,
        // Store thumbnail
        thumbnailBlob: processed.thumbnailBlob,
        thumbnailSize: processed.thumbnailSize,
        thumbnailWidth: processed.thumbnailWidth,
        thumbnailHeight: processed.thumbnailHeight,
        // Store selected ratio
        ratio: processed.ratio,
      }

      // Calculate upscale risk (always, not only when diagnostics present)
      const originalWidth = frame.width
      const originalHeight = frame.height
      const outputWidth = processed.outputWidth || 1200
      const outputHeight = processed.outputHeight || 1200
      const downscaledFromOriginal = originalWidth > outputWidth || originalHeight > outputHeight
      const upscaleRisk = originalWidth < outputWidth || originalHeight < outputHeight

      // Add capture diagnostics if available
      if (frame.diagnostics) {
        const enhancedDiagnostics: CaptureDiagnostics = {
          ...frame.diagnostics,
          processedWidth: outputWidth,
          processedHeight: outputHeight,
          processedByteSize: processed.size,
          downscaledFromOriginal,
          upscaleRisk,
          selectedRatio,
        }
        setLastCaptureDiagnostics(enhancedDiagnostics)
        photoRecord.captureMethod = frame.diagnostics.captureMethod
        photoRecord.initialStreamWidth = frame.diagnostics.initialStreamWidth
        photoRecord.initialStreamHeight = frame.diagnostics.initialStreamHeight
        photoRecord.capabilitiesWidthMax = frame.diagnostics.capabilitiesWidthMax
        photoRecord.capabilitiesHeightMax = frame.diagnostics.capabilitiesHeightMax
        photoRecord.finalStreamWidth = frame.diagnostics.finalStreamWidth
        photoRecord.finalStreamHeight = frame.diagnostics.finalStreamHeight
      }

      const stored = await photoStore.save(photoRecord)

      // Assign photo to current item
      if (item) {
        await itemPacketStore.addItemPhoto(item.id, id)
        setCurrentItem((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            photoIds: [...prev.photoIds, id],
            updatedAt: new Date().toISOString(),
          }
        })
      }

      setPhotos((prev) => [...prev, stored])
      
      const method = frame.diagnostics?.captureMethod || 'unknown'
      const itemPhotoCount = item?.photoIds.length || 0
      const statusText = `Captured ${frame.width}x${frame.height} via ${method} — Item ${item?.itemNumber || '?'} photo ${itemPhotoCount + 1}`
      setStatusMsg(upscaleRisk ? `${statusText} — ⚠️ Upscale risk` : statusText)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setCaptureErrors((prev) => [...prev, `Capture error: ${msg}`])
      setStatusMsg('Capture failed — see diagnostics')
    } finally {
      setCapturing(false)
    }
  }, [capturing, selectedRatio, currentItem])

  const handlePhotoClick = useCallback((photo: StoredPhoto) => {
    setSelectedPhoto(photo)
  }, [])

  const handleCopyDiagnostics = useCallback(() => {
    if (!lastCaptureDiagnostics) return
    const json = JSON.stringify(lastCaptureDiagnostics, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setStatusMsg('Diagnostics copied to clipboard')
    })
  }, [lastCaptureDiagnostics])

  const handleRatioChange = useCallback((ratio: OutputRatio) => {
    setSelectedRatio(ratio)
    saveDefaultRatioToStorage(ratio)
  }, [])

  const handleMetadataSave = useCallback(async () => {
    if (!currentItem) return
    try {
      await itemPacketStore.updateItemMetadata(currentItem.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
      })
      setStatusMsg('Metadata saved')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Metadata save failed: ${msg}`])
    }
  }, [currentItem, itemSku, itemNote, itemWeight])

  const handleDoneNextItem = useCallback(async () => {
    if (!currentItem) return
    try {
      // Preserve any unsaved metadata before finalizing
      const metadataToSave = {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
      }
      await itemPacketStore.updateItemMetadata(currentItem.id, metadataToSave)

      // Finalize current item
      await itemPacketStore.finalizeItem(currentItem.id)
      
      // Create new item
      const newItem = await itemPacketStore.createItem()
      setCurrentItem(newItem)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      
      setStatusMsg(`Item ${currentItem.itemNumber} saved. Now on Item ${newItem.itemNumber}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Done/Next failed: ${msg}`])
    }
  }, [currentItem, itemSku, itemNote, itemWeight])

  const handleClear = useCallback(async () => {
    try {
      // Phase 0 reset: clear both photos and item packets
      await photoStore.clearAll()
      await itemPacketStore.clearAll()
      setPhotos([])
      
      // Create a fresh draft item after reset
      const newItem = await itemPacketStore.createItem()
      setCurrentItem(newItem)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      
      setStatusMsg('Reset complete — fresh item ready')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Clear failed: ${msg}`])
    }
  }, [])

  const canCapture = cameraState === 'active' && !capturing
  const currentPhotoCount = currentItem?.photoIds.length || 0
  const currentItemPhotos = photos.filter((p) => currentItem?.photoIds.includes(p.id))

  return (
    <div style={s.screen}>
      {/* Full-width camera preview - no padding constraints */}
      <CameraPreview
        ref={cameraRef}
        onError={handleCameraError}
        onStarted={handleCameraStarted}
        onStopped={handleCameraStopped}
        ratio={selectedRatio}
      />

      {/* Controls section with padding */}
      <div style={s.controls}>
        {/* Item status header */}
        {currentItem && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            fontSize: 13,
            color: '#aaa',
          }}>
            <span>Item {currentItem.itemNumber}</span>
            <span>{currentPhotoCount} photo{currentPhotoCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {(['full', '1:1', '4:3', '16:9'] as OutputRatio[]).map((r) => (
            <button
              key={r}
              onClick={() => handleRatioChange(r)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 6,
                border: selectedRatio === r ? '1px solid #aaa' : '1px solid #333',
                background: selectedRatio === r ? '#2a2a2a' : 'transparent',
                color: selectedRatio === r ? '#eee' : '#666',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: selectedRatio === r ? 600 : 400,
              }}
            >
              {r === 'full' ? 'Full' : r}
            </button>
          ))}
        </div>

        <div style={s.statusMsg}>{statusMsg}</div>

        {/* Capture button - large, camera-first, clear text */}
        <button
          style={{ ...s.btn, ...(canCapture ? s.captureBtn : s.captureBtnDisabled), fontSize: 20, padding: '20px 0' }}
          onClick={handleCapture}
          disabled={!canCapture}
          aria-label="Capture photo"
        >
          {capturing ? 'Capturing…' : '⊙ Capture'}
        </button>

        {/* Done / Next Item button */}
        <button
          style={{
            ...s.btn,
            background: '#2a2a2a',
            color: '#eee',
            border: '1px solid #444',
            marginTop: 8,
          }}
          onClick={handleDoneNextItem}
          disabled={!currentItem || currentPhotoCount === 0}
          aria-label="Done with current item, start next item"
        >
          Done / Next Item →
        </button>

        {/* Metadata toggle */}
        <button
          style={{
            ...s.btn,
            background: 'transparent',
            color: '#666',
            border: '1px solid #333',
            marginTop: 8,
            fontSize: 11,
            padding: '8px 0',
          }}
          onClick={() => setShowMetadata(!showMetadata)}
          aria-label="Toggle optional metadata"
        >
          {showMetadata ? '▼ Hide Metadata' : '▶ Show Metadata (optional)'}
        </button>

        {/* Optional metadata inputs */}
        {showMetadata && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="SKU (optional)"
              value={itemSku}
              onChange={(e) => setItemSku(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#eee',
                fontSize: 14,
              }}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#eee',
                fontSize: 14,
              }}
            />
            <input
              type="text"
              placeholder="Weight (optional)"
              value={itemWeight}
              onChange={(e) => setItemWeight(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: 6,
                border: '1px solid #333',
                background: '#1a1a1a',
                color: '#eee',
                fontSize: 14,
              }}
            />
            <button
              style={{
                ...s.btn,
                background: '#3b82f6',
                color: '#fff',
                border: '1px solid #3b82f6',
                fontSize: 12,
                padding: '10px 0',
              }}
              onClick={handleMetadataSave}
              aria-label="Save metadata"
            >
              Save Metadata
            </button>
          </div>
        )}

        {/* Secondary controls - collapsed/less prominent */}
        <button
          style={{
            ...s.btn,
            background: 'transparent',
            color: '#666',
            border: '1px solid #333',
            marginTop: 8,
            fontSize: 11,
            padding: '8px 0',
          }}
          onClick={handleClear}
          disabled={photos.length === 0 && !currentItem}
          aria-label="Reset local Phase 0 test data"
        >
          Reset Phase 0 Test Data
        </button>

        {lastCaptureDiagnostics && (
          <button
            style={{
              ...s.btn,
              background: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              marginTop: 4,
              fontSize: 11,
              padding: '8px 0',
            }}
            onClick={handleCopyDiagnostics}
            aria-label="Copy last capture diagnostics"
          >
            Copy Diagnostics
          </button>
        )}

        {/* Diagnostics toggle - collapsed by default for camera-first experience */}
        <button
          style={{
            ...s.btn,
            background: 'transparent',
            color: '#666',
            border: '1px solid #333',
            marginTop: 8,
            fontSize: 12,
            padding: '10px 0',
          }}
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          aria-label="Toggle diagnostics"
        >
          {showDiagnostics ? '▼ Hide Diagnostics' : '▶ Show Diagnostics'}
        </button>

        {showDiagnostics && (
          <DiagnosticsPanel
            cameraState={cameraState}
            capabilities={capabilities}
            captureErrors={captureErrors}
            storageErrors={storageErrors}
            secureContext={secureContextInfo}
            lastCaptureDiagnostics={lastCaptureDiagnostics}
          />
        )}
      </div>

      {/* Photo list - secondary, below camera controls */}
      <PhotoList photos={currentItemPhotos} onPhotoClick={handlePhotoClick} />

      <PhotoDetailModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  )
}
