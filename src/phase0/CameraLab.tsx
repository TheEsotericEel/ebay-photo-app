import { useCallback, useEffect, useRef, useState } from 'react'

// ImageCapture declaration for TypeScript
declare class ImageCapture {
  constructor(track: MediaStreamTrack)
  grabFrame(): Promise<ImageBitmap>
  takePhoto(): Promise<Blob>
}

// Extended MediaTrack types for capabilities not in standard lib
interface ExtendedMediaTrackSupportedConstraints extends MediaTrackSupportedConstraints {
  zoom?: boolean
  focusMode?: boolean
  focusDistance?: boolean
  pointsOfInterest?: boolean
  torch?: boolean
  exposureMode?: boolean
  exposureTime?: boolean
  exposureCompensation?: boolean
  whiteBalanceMode?: boolean
  brightness?: boolean
  contrast?: boolean
  saturation?: boolean
  sharpness?: boolean
  iso?: boolean
}

interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  zoom?: number | ConstrainDoubleRange
  focusMode?: string | string[] | ConstrainDOMStringParameters
  focusDistance?: number | ConstrainDoubleRange
  pointsOfInterest?: { x: number; y: number } | { x: number; y: number }[]
  torch?: boolean
  exposureMode?: string | string[] | ConstrainDOMStringParameters
  exposureTime?: number | ConstrainDoubleRange
  exposureCompensation?: number | ConstrainDoubleRange
  whiteBalanceMode?: string | string[] | ConstrainDOMStringParameters
  brightness?: number | ConstrainDoubleRange
  contrast?: number | ConstrainDoubleRange
  saturation?: number | ConstrainDoubleRange
  sharpness?: number | ConstrainDoubleRange
  iso?: number | ConstrainDoubleRange
}

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number }
  focusMode?: string[]
  focusDistance?: { min: number; max: number; step: number }
  pointsOfInterest?: { x: number; y: number }[]
  torch?: boolean
  exposureMode?: string[]
  exposureTime?: { min: number; max: number; step: number }
  exposureCompensation?: { min: number; max: number; step: number }
  whiteBalanceMode?: string[]
  brightness?: { min: number; max: number; step: number }
  contrast?: { min: number; max: number; step: number }
  saturation?: { min: number; max: number; step: number }
  sharpness?: { min: number; max: number; step: number }
  iso?: { min: number; max: number; step: number }
}

interface ExtendedMediaTrackSettings extends MediaTrackSettings {
  zoom?: number
  focusMode?: string
  focusDistance?: number
  pointsOfInterest?: { x: number; y: number }
  torch?: boolean
  exposureMode?: string
  exposureTime?: number
  exposureCompensation?: number
  whiteBalanceMode?: string
  brightness?: number
  contrast?: number
  saturation?: number
  sharpness?: number
  iso?: number
}

interface ContextDiagnostics {
  userAgent: string
  platform?: string
  url: string
  protocol: string
  hostname: string
  isSecureContext: boolean
  standalone?: boolean
  displayMode?: string
  mediaDevicesPresent: boolean
  getUserMediaPresent: boolean
  enumerateDevicesPresent: boolean
  getSupportedConstraints: ExtendedMediaTrackSupportedConstraints
  imageCaptureAvailable: boolean
  screenWidth: number
  screenHeight: number
  devicePixelRatio: number
}

interface DeviceInfo {
  kind: string
  deviceId: string
  label: string
  groupId: string
}

interface StreamTestResult {
  presetName: string
  constraints: MediaStreamConstraints
  success: boolean
  videoWidth: number
  videoHeight: number
  clientWidth: number
  clientHeight: number
  trackLabel: string
  trackSettings: MediaTrackSettings | null
  trackCapabilities: MediaTrackCapabilities | null
  trackConstraints: MediaTrackConstraints | null
  error: string | null
}

interface DeviceIdTestResult {
  deviceId: string
  label: string
  success: boolean
  videoWidth: number
  videoHeight: number
  trackSettings: MediaTrackSettings | null
  trackCapabilities: MediaTrackCapabilities | null
  sampleDataUrl?: string
  error: string | null
}

interface CaptureMethodResult {
  method: 'takePhoto' | 'grabFrame' | 'canvas' | 'createImageBitmap'
  success: boolean
  mimeType: string
  byteSize: number
  naturalWidth: number
  naturalHeight: number
  sourceSettings: MediaTrackSettings | null
  thumbnailDataUrl?: string
  error: string | null
}

interface AspectRatioTestResult {
  requestedAspectRatio: number | null
  requestedConstraint: string
  success: boolean
  actualWidth: number
  actualHeight: number
  actualAspectRatio: number
  normalizedAspectRatio: number
  orientation: 'landscape' | 'portrait' | 'square'
  nativeSquareLikelySupported: boolean
  error: string | null
}

interface ZoomTestResult {
  zoomApiExposed: boolean
  min: number | null
  max: number | null
  step: number | null
  current: number | null
  applyMinSuccess: boolean
  applyMidSuccess: boolean
  applyMaxSuccess: boolean
  errors: string[]
}

interface FocusTestResult {
  focusModeApiExposed: boolean
  supportedModes: string[]
  focusDistanceReported: boolean
  focusDistanceControllable: boolean | 'unknown'
  focusDistanceRange: { min: number | null; max: number | null; step: number | null }
  pointsOfInterestApiExposed: boolean
  tapToFocusApiExposed: boolean
  manualFocusApiExposed: boolean
  manualFocusUsable: boolean | 'unknown'
  systemAutofocusOnlyLikely: boolean
  testResults: {
    mode?: string
    success: boolean
    error?: string
  }[]
}

interface TorchTestResult {
  torchApiExposed: boolean
  exposureModeApiExposed: boolean
  exposureTimeApiExposed: boolean
  exposureCompensationApiExposed: boolean
  whiteBalanceModeApiExposed: boolean
  whiteBalanceModesSupported: string[]
  whiteBalanceApplySuccess: boolean
  brightnessApiExposed: boolean
  contrastApiExposed: boolean
  saturationApiExposed: boolean
  sharpnessApiExposed: boolean
  isoApiExposed: boolean
  torchToggleSuccess: boolean
  error: string | null
}

interface HighResDeviceTestResult {
  deviceId: string
  label: string
  tests: {
    resolution: string
    constraints: MediaStreamConstraints
    success: boolean
    videoWidth: number
    videoHeight: number
    takePhotoSuccess: boolean
    takePhotoWidth: number
    takePhotoHeight: number
    takePhotoSize: number
    grabFrameSuccess: boolean
    grabFrameWidth: number
    grabFrameHeight: number
    grabFrameSize: number
    canvasSuccess: boolean
    canvasWidth: number
    canvasHeight: number
    canvasSize: number
    error: string | null
  }[]
}

interface PerDeviceZoomTestResult {
  deviceId: string
  label: string
  zoomApiExposed: boolean
  min: number | null
  max: number | null
  step: number | null
  current: number | null
  applyResults: {
    value: number
    success: boolean
    resultingZoom: number | null
    error: string | null
  }[]
}

interface WhiteBalanceTestResult {
  whiteBalanceModeApiExposed: boolean
  supportedModes: string[]
  applyContinuousSuccess: boolean
  applyManualSuccess: boolean
  error: string | null
}

interface FileInputResult {
  mimeType: string
  byteSize: number
  width: number
  height: number
  exifOrientationNeeded: boolean
  error: string | null
}

interface DiagnosticsReport {
  timestamp: string
  context: ContextDiagnostics
  devices: DeviceInfo[]
  streamTests: StreamTestResult[]
  deviceIdTests: DeviceIdTestResult[]
  captureMethodTests: CaptureMethodResult[]
  aspectRatioTests: AspectRatioTestResult[]
  zoomTest: ZoomTestResult
  focusTest: FocusTestResult
  torchTest: TorchTestResult
  whiteBalanceTest: WhiteBalanceTestResult
  highResDeviceTests: HighResDeviceTestResult[]
  perDeviceZoomTests: PerDeviceZoomTestResult[]
  fileInputResult: FileInputResult | null
  summary: {
    getUserMedia: boolean
    enumerateDevices: boolean
    videoInputCount: number
    imageCaptureTakePhoto: boolean
    imageCaptureGrabFrame: boolean
    canvasCapture: boolean
    nativeSquareAspectRatio: boolean
    zoomApi: boolean
    focusModeApi: boolean
    focusDistanceApi: boolean
    pointsOfInterestApi: boolean
    torchApi: boolean
    multipleRearDevicesExposed: boolean
  }
  capabilityMatrix: {
    multipleRearDevicesExposed: boolean
    ultraWideDeviceLabelExposed: boolean
    telephotoDeviceLabelExposed: boolean
    highResVideoStreamWorks: boolean
    highestObservedVideoDimensions: string
    highestObservedTakePhotoDimensions: string
    highestObservedCanvasDimensions: string
    squareNativeStreamWorks: boolean
    squareNativeHighestObservedDimensions: string
    zoomCapabilityReported: boolean
    zoomApplyWorks: boolean
    torchReported: boolean
    torchApplyWorks: boolean
    focusDistanceReported: boolean
    focusDistanceApplyWorks: boolean
    tapToFocusExposed: boolean
    manualFocusUsable: boolean | 'unknown'
    fileInputFallbackTested: boolean
    fileInputObservedDimensions: string
  }
}

interface LabSample {
  id: string
  type: 'stream' | 'deviceId' | 'captureMethod'
  category: string
  dataUrl: string
  metadata: Record<string, unknown>
  createdAt: string
}

// IndexedDB for lab samples
const LAB_DB_NAME = 'CameraLabDB'
const LAB_STORE_NAME = 'samples'

class LabSampleStore {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(LAB_DB_NAME, 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(LAB_STORE_NAME)) {
          db.createObjectStore(LAB_STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  }

  async save(sample: LabSample): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(LAB_STORE_NAME, 'readwrite')
      const store = tx.objectStore(LAB_STORE_NAME)
      const request = store.put(sample)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getAll(): Promise<LabSample[]> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(LAB_STORE_NAME, 'readonly')
      const store = tx.objectStore(LAB_STORE_NAME)
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async clear(): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(LAB_STORE_NAME, 'readwrite')
      const store = tx.objectStore(LAB_STORE_NAME)
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

const labStore = new LabSampleStore()

const s: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '12px',
    gap: 12,
  },
  header: {
    fontSize: 14,
    color: '#888',
    padding: '8px 0',
    borderBottom: '1px solid #222',
    marginBottom: 4,
  },
  title: { color: '#ddd', fontWeight: 600 },
  section: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#aaa',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  btn: {
    padding: '12px 16px',
    borderRadius: 6,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  primaryBtn: {
    background: '#3b82f6',
    color: '#fff',
  },
  secondaryBtn: {
    background: '#2a2a2a',
    color: '#ddd',
    border: '1px solid #333',
  },
  dangerBtn: {
    background: 'transparent',
    color: '#c0392b',
    border: '1px solid #c0392b',
  },
  log: {
    background: '#0a0a0a',
    border: '1px solid #222',
    borderRadius: 6,
    padding: 8,
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#aaa',
    maxHeight: 200,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
  },
  summaryTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  summaryCell: {
    border: '1px solid #2a2a2a',
    padding: '6px 8px',
    textAlign: 'left',
  },
  summaryHeader: {
    background: '#1a1a1a',
    fontWeight: 600,
    color: '#ddd',
  },
  thumbnail: {
    width: 60,
    height: 60,
    objectFit: 'cover',
    borderRadius: 4,
    border: '1px solid #333',
  },
  thumbnailGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
    gap: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  value: {
    fontSize: 12,
    color: '#ddd',
    marginBottom: 8,
  },
  statusPass: { color: '#22c55e' },
  statusFail: { color: '#ef4444' },
  statusSkip: { color: '#888' },
  statusWarn: { color: '#f59e0b' },
}

export function CameraLab() {
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [samples, setSamples] = useState<LabSample[]>([])
  const [fileInputResult, setFileInputResult] = useState<FileInputResult | null>(null)

  const logRef = useRef<string[]>([])

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toISOString().slice(11, 19)
    const entry = `[${timestamp}] ${msg}`
    logRef.current = [...logRef.current, entry]
    setLog([...logRef.current])
  }, [])

  const loadSamples = useCallback(async () => {
    try {
      const all = await labStore.getAll()
      setSamples(all)
    } catch (err) {
      addLog(`Failed to load samples: ${err}`)
    }
  }, [addLog])

  useEffect(() => {
    loadSamples()
  }, [loadSamples])

  const clearSamples = useCallback(async () => {
    try {
      await labStore.clear()
      setSamples([])
      addLog('Lab samples cleared')
    } catch (err) {
      addLog(`Failed to clear samples: ${err}`)
    }
  }, [addLog])

  // Context diagnostics
  const collectContextDiagnostics = useCallback((): ContextDiagnostics => {
    const ua = navigator.userAgent
    const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {}

    return {
      userAgent: ua,
      platform: (navigator as unknown as { platform?: string }).platform,
      url: window.location.href,
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      isSecureContext: window.isSecureContext,
      standalone: (navigator as unknown as { standalone?: boolean }).standalone,
      displayMode: (window.navigator as unknown as { displayMode?: string }).displayMode,
      mediaDevicesPresent: !!navigator.mediaDevices,
      getUserMediaPresent: !!navigator.mediaDevices?.getUserMedia,
      enumerateDevicesPresent: !!navigator.mediaDevices?.enumerateDevices,
      getSupportedConstraints: supported,
      imageCaptureAvailable: typeof ImageCapture !== 'undefined',
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
    }
  }, [])

  // Request permission and enumerate devices
  const enumerateDevicesWithPermission = useCallback(async (): Promise<DeviceInfo[]> => {
    addLog('Requesting camera permission...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      stream.getTracks().forEach((t) => t.stop())
      addLog('Permission granted')

      addLog('Enumerating devices...')
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({
          kind: d.kind,
          deviceId: d.deviceId,
          label: d.label || '(unlabeled)',
          groupId: d.groupId,
        }))

      addLog(`Found ${videoInputs.length} video input devices`)
      videoInputs.forEach((d, i) => {
        addLog(`  Device ${i}: ${d.label} (id: ${d.deviceId.slice(0, 8)}...)`)
      })

      return videoInputs
    } catch (err) {
      addLog(`Permission/enumeration failed: ${err}`)
      return []
    }
  }, [addLog])

  // Test a stream with specific constraints
  const testStream = useCallback(
    async (presetName: string, constraints: MediaStreamConstraints): Promise<StreamTestResult> => {
      addLog(`Testing preset: ${presetName}`)
      let stream: MediaStream | null = null
      let videoEl: HTMLVideoElement | null = null

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        videoEl = document.createElement('video')
        videoEl.autoplay = true
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.style.width = '320px'
        videoEl.style.height = '240px'
        videoEl.style.position = 'absolute'
        videoEl.style.visibility = 'hidden'
        document.body.appendChild(videoEl)
        videoEl.srcObject = stream

        await new Promise<void>((resolve) => {
          videoEl!.onloadedmetadata = () => resolve()
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        const track = stream.getVideoTracks()[0]
        const trackSettings = track.getSettings()
        const trackCapabilities = track.getCapabilities()
        const trackConstraints = track.getConstraints()

        addLog(`  Success: ${videoEl.videoWidth}x${videoEl.videoHeight}`)

        return {
          presetName,
          constraints,
          success: true,
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
          clientWidth: videoEl.clientWidth,
          clientHeight: videoEl.clientHeight,
          trackLabel: track.label,
          trackSettings,
          trackCapabilities,
          trackConstraints,
          error: null,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addLog(`  Failed: ${msg}`)
        return {
          presetName,
          constraints,
          success: false,
          videoWidth: 0,
          videoHeight: 0,
          clientWidth: 0,
          clientHeight: 0,
          trackLabel: '',
          trackSettings: null,
          trackCapabilities: null,
          trackConstraints: null,
          error: msg,
        }
      } finally {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
        }
        if (videoEl) {
          document.body.removeChild(videoEl)
        }
      }
    },
    [addLog],
  )

  // Stream preset sweep
  const runStreamPresetSweep = useCallback(async (): Promise<StreamTestResult[]> => {
    const presets: { name: string; constraints: MediaStreamConstraints }[] = [
      { name: 'basic video: true', constraints: { video: true, audio: false } },
      { name: 'rear ideal environment', constraints: { video: { facingMode: { ideal: 'environment' } }, audio: false } },
      { name: 'rear ideal 1920x1080', constraints: { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false } },
      { name: 'rear ideal 1920x1440 (4:3)', constraints: { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false } },
      { name: 'rear ideal 1280x720', constraints: { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false } },
      { name: 'rear ideal square/aspectRatio 1', constraints: { video: { facingMode: { ideal: 'environment' }, aspectRatio: { ideal: 1 } }, audio: false } },
    ]

    const results: StreamTestResult[] = []
    for (const preset of presets) {
      const result = await testStream(preset.name, preset.constraints)
      results.push(result)
      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    return results
  }, [addLog, testStream])

  // DeviceId sweep
  const runDeviceIdSweep = useCallback(
    async (devices: DeviceInfo[]): Promise<DeviceIdTestResult[]> => {
      const results: DeviceIdTestResult[] = []

      for (const device of devices) {
        addLog(`Testing deviceId: ${device.label}`)
        let stream: MediaStream | null = null
        let videoEl: HTMLVideoElement | null = null

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } },
            audio: false,
          })
          videoEl = document.createElement('video')
          videoEl.autoplay = true
          videoEl.muted = true
          videoEl.playsInline = true
          videoEl.style.width = '320px'
          videoEl.style.height = '240px'
          videoEl.style.position = 'absolute'
          videoEl.style.visibility = 'hidden'
          document.body.appendChild(videoEl)
          videoEl.srcObject = stream

          await new Promise<void>((resolve) => {
            videoEl!.onloadedmetadata = () => resolve()
          })

          await new Promise((resolve) => setTimeout(resolve, 500))

          const track = stream.getVideoTracks()[0]
          const trackSettings = track.getSettings()
          const trackCapabilities = track.getCapabilities()

          // Capture a small sample
          let sampleDataUrl: string | undefined
          try {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = 120
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(videoEl, 0, 0, 160, 120)
              sampleDataUrl = canvas.toDataURL('image/jpeg', 0.7)

              // Save to lab store
              const sample: LabSample = {
                id: `sample-device-${device.deviceId.slice(0, 8)}-${Date.now()}`,
                type: 'deviceId',
                category: device.label,
                dataUrl: sampleDataUrl,
                metadata: {
                  deviceId: device.deviceId,
                  label: device.label,
                  videoWidth: videoEl.videoWidth,
                  videoHeight: videoEl.videoHeight,
                },
                createdAt: new Date().toISOString(),
              }
              await labStore.save(sample)
            }
          } catch (e) {
            addLog(`  Sample capture failed: ${e}`)
          }

          addLog(`  Success: ${videoEl.videoWidth}x${videoEl.videoHeight}`)

          results.push({
            deviceId: device.deviceId,
            label: device.label,
            success: true,
            videoWidth: videoEl.videoWidth,
            videoHeight: videoEl.videoHeight,
            trackSettings,
            trackCapabilities,
            sampleDataUrl,
            error: null,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          addLog(`  Failed: ${msg}`)
          results.push({
            deviceId: device.deviceId,
            label: device.label,
            success: false,
            videoWidth: 0,
            videoHeight: 0,
            trackSettings: null,
            trackCapabilities: null,
            error: msg,
          })
        } finally {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
          }
          if (videoEl) {
            document.body.removeChild(videoEl)
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      await loadSamples()
      return results
    },
    [addLog, loadSamples],
  )

  // Capture method tests
  const runCaptureMethodTests = useCallback(
    async (deviceId?: string): Promise<CaptureMethodResult[]> => {
      const results: CaptureMethodResult[] = []
      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: { facingMode: { ideal: 'environment' } }, audio: false }

      let stream: MediaStream | null = null
      let videoEl: HTMLVideoElement | null = null

      try {
        addLog('Starting stream for capture method tests...')
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        videoEl = document.createElement('video')
        videoEl.autoplay = true
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.style.width = '320px'
        videoEl.style.height = '240px'
        videoEl.style.position = 'absolute'
        videoEl.style.visibility = 'hidden'
        document.body.appendChild(videoEl)
        videoEl.srcObject = stream

        await new Promise<void>((resolve) => {
          videoEl!.onloadedmetadata = () => resolve()
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        const track = stream.getVideoTracks()[0]
        const trackSettings = track.getSettings()

        // Test ImageCapture.takePhoto
        if (typeof ImageCapture !== 'undefined') {
          addLog('Testing ImageCapture.takePhoto()...')
          try {
            const imageCapture = new ImageCapture(track)
            const blob = await imageCapture.takePhoto()
            const bitmap = await createImageBitmap(blob)
            const dataUrl = await bitmapToDataUrl(bitmap, 80, 80)

            results.push({
              method: 'takePhoto',
              success: true,
              mimeType: blob.type,
              byteSize: blob.size,
              naturalWidth: bitmap.width,
              naturalHeight: bitmap.height,
              sourceSettings: trackSettings,
              thumbnailDataUrl: dataUrl,
              error: null,
            })
            addLog('  takePhoto: success')
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            results.push({
              method: 'takePhoto',
              success: false,
              mimeType: '',
              byteSize: 0,
              naturalWidth: 0,
              naturalHeight: 0,
              sourceSettings: trackSettings,
              error: msg,
            })
            addLog(`  takePhoto: failed - ${msg}`)
          }
        } else {
          results.push({
            method: 'takePhoto',
            success: false,
            mimeType: '',
            byteSize: 0,
            naturalWidth: 0,
            naturalHeight: 0,
            sourceSettings: trackSettings,
            error: 'ImageCapture not available',
          })
          addLog('  takePhoto: ImageCapture not available')
        }

        // Test ImageCapture.grabFrame
        if (typeof ImageCapture !== 'undefined') {
          addLog('Testing ImageCapture.grabFrame()...')
          try {
            const imageCapture = new ImageCapture(track)
            const bitmap = await imageCapture.grabFrame()
            const blob = await bitmapToBlob(bitmap)
            const dataUrl = await bitmapToDataUrl(bitmap, 80, 80)

            results.push({
              method: 'grabFrame',
              success: true,
              mimeType: blob.type,
              byteSize: blob.size,
              naturalWidth: bitmap.width,
              naturalHeight: bitmap.height,
              sourceSettings: trackSettings,
              thumbnailDataUrl: dataUrl,
              error: null,
            })
            addLog('  grabFrame: success')
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            results.push({
              method: 'grabFrame',
              success: false,
              mimeType: '',
              byteSize: 0,
              naturalWidth: 0,
              naturalHeight: 0,
              sourceSettings: trackSettings,
              error: msg,
            })
            addLog(`  grabFrame: failed - ${msg}`)
          }
        } else {
          results.push({
            method: 'grabFrame',
            success: false,
            mimeType: '',
            byteSize: 0,
            naturalWidth: 0,
            naturalHeight: 0,
            sourceSettings: trackSettings,
            error: 'ImageCapture not available',
          })
          addLog('  grabFrame: ImageCapture not available')
        }

        // Test canvas capture
        addLog('Testing canvas capture...')
        try {
          const canvas = document.createElement('canvas')
          canvas.width = videoEl.videoWidth
          canvas.height = videoEl.videoHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Could not get 2d context')
          ctx.drawImage(videoEl, 0, 0)

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => {
                if (b) resolve(b)
                else reject(new Error('toBlob returned null'))
              },
              'image/jpeg',
              0.92,
            )
          })

          const bitmap = await createImageBitmap(blob)
          const dataUrl = await bitmapToDataUrl(bitmap, 80, 80)

          results.push({
            method: 'canvas',
            success: true,
            mimeType: blob.type,
            byteSize: blob.size,
            naturalWidth: bitmap.width,
            naturalHeight: bitmap.height,
            sourceSettings: trackSettings,
            thumbnailDataUrl: dataUrl,
            error: null,
          })
          addLog('  canvas: success')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results.push({
            method: 'canvas',
            success: false,
            mimeType: '',
            byteSize: 0,
            naturalWidth: 0,
            naturalHeight: 0,
            sourceSettings: trackSettings,
            error: msg,
          })
          addLog(`  canvas: failed - ${msg}`)
        }

        // Test createImageBitmap from video
        addLog('Testing createImageBitmap from video...')
        try {
          const bitmap = await createImageBitmap(videoEl)
          const blob = await bitmapToBlob(bitmap)
          const dataUrl = await bitmapToDataUrl(bitmap, 80, 80)

          results.push({
            method: 'createImageBitmap',
            success: true,
            mimeType: blob.type,
            byteSize: blob.size,
            naturalWidth: bitmap.width,
            naturalHeight: bitmap.height,
            sourceSettings: trackSettings,
            thumbnailDataUrl: dataUrl,
            error: null,
          })
          addLog('  createImageBitmap: success')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          results.push({
            method: 'createImageBitmap',
            success: false,
            mimeType: '',
            byteSize: 0,
            naturalWidth: 0,
            naturalHeight: 0,
            sourceSettings: trackSettings,
            error: msg,
          })
          addLog(`  createImageBitmap: failed - ${msg}`)
        }
      } finally {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
        }
        if (videoEl) {
          document.body.removeChild(videoEl)
        }
      }

      return results
    },
    [addLog],
  )

  // Aspect ratio tests
  const runAspectRatioTests = useCallback(async (): Promise<AspectRatioTestResult[]> => {
    const tests: { name: string; aspectRatio: number | null; constraint: string }[] = [
      { name: 'square', aspectRatio: 1, constraint: 'aspectRatio: { ideal: 1 }' },
      { name: '4:3', aspectRatio: 4 / 3, constraint: 'aspectRatio: { ideal: 1.333 }' },
      { name: '16:9', aspectRatio: 16 / 9, constraint: 'aspectRatio: { ideal: 1.778 }' },
    ]

    const results: AspectRatioTestResult[] = []

    for (const test of tests) {
      addLog(`Testing aspect ratio: ${test.name}`)
      let stream: MediaStream | null = null
      let videoEl: HTMLVideoElement | null = null

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: 'environment' },
            aspectRatio: test.aspectRatio ? { ideal: test.aspectRatio } : undefined,
          },
          audio: false,
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints)
        videoEl = document.createElement('video')
        videoEl.autoplay = true
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.style.width = '320px'
        videoEl.style.height = '240px'
        videoEl.style.position = 'absolute'
        videoEl.style.visibility = 'hidden'
        document.body.appendChild(videoEl)
        videoEl.srcObject = stream

        await new Promise<void>((resolve) => {
          videoEl!.onloadedmetadata = () => resolve()
        })

        await new Promise((resolve) => setTimeout(resolve, 500))

        const actualWidth = videoEl.videoWidth
        const actualHeight = videoEl.videoHeight
        const actualAspectRatio = actualWidth / actualHeight

        // Normalize aspect ratio (always >= 1)
        const normalizedAspectRatio = actualAspectRatio >= 1 ? actualAspectRatio : 1 / actualAspectRatio

        // Determine orientation
        const orientation: 'landscape' | 'portrait' | 'square' =
          Math.abs(actualAspectRatio - 1) < 0.05 ? 'square' : actualAspectRatio > 1 ? 'landscape' : 'portrait'

        // Determine if native square is likely supported (only for square test)
        const nativeSquareLikelySupported =
          test.aspectRatio === 1
            ? Math.abs(actualAspectRatio - 1) < 0.05
            : Math.abs(normalizedAspectRatio - (test.aspectRatio ?? 1)) < 0.05

        addLog(`  Requested: ${test.constraint}, Actual: ${actualWidth}x${actualHeight} (${actualAspectRatio.toFixed(3)}, normalized: ${normalizedAspectRatio.toFixed(3)}, ${orientation})`)

        results.push({
          requestedAspectRatio: test.aspectRatio,
          requestedConstraint: test.constraint,
          success: true,
          actualWidth,
          actualHeight,
          actualAspectRatio,
          normalizedAspectRatio,
          orientation,
          nativeSquareLikelySupported,
          error: null,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addLog(`  Failed: ${msg}`)
        results.push({
          requestedAspectRatio: test.aspectRatio,
          requestedConstraint: test.constraint,
          success: false,
          actualWidth: 0,
          actualHeight: 0,
          actualAspectRatio: 0,
          normalizedAspectRatio: 0,
          orientation: 'landscape',
          nativeSquareLikelySupported: false,
          error: msg,
        })
      } finally {
        if (stream) {
          stream.getTracks().forEach((t) => t.stop())
        }
        if (videoEl) {
          document.body.removeChild(videoEl)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300))
    }

    return results
  }, [addLog])

  // Zoom tests
  const runZoomTests = useCallback(async (): Promise<ZoomTestResult> => {
    addLog('Testing zoom capabilities...')
    let stream: MediaStream | null = null
    let videoEl: HTMLVideoElement | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      videoEl = document.createElement('video')
      videoEl.autoplay = true
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.style.width = '320px'
      videoEl.style.height = '240px'
      videoEl.style.position = 'absolute'
      videoEl.style.visibility = 'hidden'
      document.body.appendChild(videoEl)
      videoEl.srcObject = stream

      await new Promise<void>((resolve) => {
        videoEl!.onloadedmetadata = () => resolve()
      })

      await new Promise((resolve) => setTimeout(resolve, 500))

      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities
      const settings = track.getSettings() as ExtendedMediaTrackSettings

      const zoomCap = capabilities.zoom
      const zoomSetting = settings.zoom

      const zoomApiExposed = !!zoomCap
      let min: number | null = null
      let max: number | null = null
      let step: number | null = null
      let current: number | null = null

      if (zoomApiExposed && zoomCap) {
        min = zoomCap.min
        max = zoomCap.max
        step = zoomCap.step
        current = zoomSetting ?? null
        addLog(`  Zoom API exposed: min=${min}, max=${max}, step=${step}, current=${current}`)
      } else {
        addLog('  Zoom API not exposed')
      }

      const errors: string[] = []
      let applyMinSuccess = false
      let applyMidSuccess = false
      let applyMaxSuccess = false

      if (zoomApiExposed && zoomCap && min !== null && max !== null) {
        // Try applying min
        try {
          await track.applyConstraints({ advanced: [{ zoom: min }] as ExtendedMediaTrackConstraintSet[] })
          const newSettings = track.getSettings() as ExtendedMediaTrackSettings
          const newZoom = newSettings.zoom
          applyMinSuccess = newZoom === min
          addLog(`  Apply min zoom: ${applyMinSuccess ? 'success' : 'failed'}`)
        } catch (err) {
          errors.push(`Apply min failed: ${err}`)
          addLog(`  Apply min failed: ${err}`)
        }

        // Try applying mid
        try {
          const mid = min + (max - min) / 2
          await track.applyConstraints({ advanced: [{ zoom: mid }] as ExtendedMediaTrackConstraintSet[] })
          const newSettings = track.getSettings() as ExtendedMediaTrackSettings
          const newZoom = newSettings.zoom
          applyMidSuccess = Math.abs((newZoom ?? 0) - mid) < (step ?? 0.1)
          addLog(`  Apply mid zoom: ${applyMidSuccess ? 'success' : 'failed'}`)
        } catch (err) {
          errors.push(`Apply mid failed: ${err}`)
          addLog(`  Apply mid failed: ${err}`)
        }

        // Try applying max
        try {
          await track.applyConstraints({ advanced: [{ zoom: max }] as ExtendedMediaTrackConstraintSet[] })
          const newSettings = track.getSettings() as ExtendedMediaTrackSettings
          const newZoom = newSettings.zoom
          applyMaxSuccess = newZoom === max
          addLog(`  Apply max zoom: ${applyMaxSuccess ? 'success' : 'failed'}`)
        } catch (err) {
          errors.push(`Apply max failed: ${err}`)
          addLog(`  Apply max failed: ${err}`)
        }
      }

      return {
        zoomApiExposed,
        min,
        max,
        step,
        current,
        applyMinSuccess,
        applyMidSuccess,
        applyMaxSuccess,
        errors,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`Zoom test failed: ${msg}`)
      return {
        zoomApiExposed: false,
        min: null,
        max: null,
        step: null,
        current: null,
        applyMinSuccess: false,
        applyMidSuccess: false,
        applyMaxSuccess: false,
        errors: [msg],
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      if (videoEl) {
        document.body.removeChild(videoEl)
      }
    }
  }, [addLog])

  // Focus tests
  const runFocusTests = useCallback(async (): Promise<FocusTestResult> => {
    addLog('Testing focus capabilities...')
    let stream: MediaStream | null = null
    let videoEl: HTMLVideoElement | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      videoEl = document.createElement('video')
      videoEl.autoplay = true
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.style.width = '320px'
      videoEl.style.height = '240px'
      videoEl.style.position = 'absolute'
      videoEl.style.visibility = 'hidden'
      document.body.appendChild(videoEl)
      videoEl.srcObject = stream

      await new Promise<void>((resolve) => {
        videoEl!.onloadedmetadata = () => resolve()
      })

      await new Promise((resolve) => setTimeout(resolve, 500))

      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities()

      const focusModeCap = (capabilities as MediaTrackCapabilities & { focusMode?: string[] }).focusMode
      const focusDistanceCap = (capabilities as MediaTrackCapabilities & {
        focusDistance?: { min: number; max: number; step: number }
      }).focusDistance
      const pointsOfInterestCap = (capabilities as MediaTrackCapabilities & {
        pointsOfInterest?: { x: number; y: number }[]
      }).pointsOfInterest

      const focusModeApiExposed = Array.isArray(focusModeCap) && focusModeCap.length > 0
      const focusDistanceReported = !!focusDistanceCap
      const pointsOfInterestApiExposed = Array.isArray(pointsOfInterestCap)

      addLog(`  focusMode API: ${focusModeApiExposed ? 'exposed' : 'not exposed'}`)
      if (focusModeApiExposed) {
        addLog(`    Supported modes: ${focusModeCap.join(', ')}`)
      }
      addLog(`  focusDistance API: ${focusDistanceReported ? 'reported' : 'not reported'}`)
      if (focusDistanceReported && focusDistanceCap) {
        addLog(`    Range: min=${focusDistanceCap.min}, max=${focusDistanceCap.max ?? 'none'}, step=${focusDistanceCap.step ?? 'none'}`)
      }
      addLog(`  pointsOfInterest API: ${pointsOfInterestApiExposed ? 'exposed' : 'not exposed'}`)

      const testResults: { mode?: string; success: boolean; error?: string }[] = []

      // Test focus modes
      if (focusModeApiExposed && focusModeCap) {
        for (const mode of focusModeCap) {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: mode }] as ExtendedMediaTrackConstraintSet[] })
            testResults.push({ mode, success: true })
            addLog(`  focusMode ${mode}: success`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            testResults.push({ mode, success: false, error: msg })
            addLog(`  focusMode ${mode}: failed - ${msg}`)
          }
        }
      }

      // Test focus distance
      let focusDistanceApplySuccess = false
      if (focusDistanceReported && focusDistanceCap) {
        try {
          await track.applyConstraints({ advanced: [{ focusDistance: focusDistanceCap.min }] as ExtendedMediaTrackConstraintSet[] })
          focusDistanceApplySuccess = true
          addLog(`  focusDistance min: success`)
        } catch (err) {
          addLog(`  focusDistance min: failed - ${err}`)
        }
      }

      // Test points of interest
      let pointsOfInterestApplySuccess = false
      if (pointsOfInterestApiExposed) {
        try {
          await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x: 0.5, y: 0.5 }] }] as ExtendedMediaTrackConstraintSet[] })
          pointsOfInterestApplySuccess = true
          addLog(`  pointsOfInterest center: success`)
        } catch (err) {
          addLog(`  pointsOfInterest center: failed - ${err}`)
        }
      }

      // Determine conclusions
      const systemAutofocusOnlyLikely = !focusModeApiExposed && !focusDistanceReported && !pointsOfInterestApiExposed
      const tapToFocusApiExposed = pointsOfInterestApiExposed && pointsOfInterestApplySuccess
      const manualFocusApiExposed = focusModeApiExposed || focusDistanceReported
      const focusDistanceControllable: boolean | 'unknown' = focusDistanceReported
        ? focusDistanceCap?.max !== null && focusDistanceCap?.step !== null
          ? focusDistanceApplySuccess
          : 'unknown'
        : false
      const manualFocusUsable: boolean | 'unknown' = focusDistanceReported
        ? focusDistanceControllable === true && focusDistanceApplySuccess
        : focusModeApiExposed
        ? testResults.some((r) => r.success)
        : 'unknown'

      return {
        focusModeApiExposed,
        supportedModes: focusModeCap ?? [],
        focusDistanceReported,
        focusDistanceControllable,
        focusDistanceRange: {
          min: focusDistanceCap?.min ?? null,
          max: focusDistanceCap?.max ?? null,
          step: focusDistanceCap?.step ?? null,
        },
        pointsOfInterestApiExposed,
        tapToFocusApiExposed,
        manualFocusApiExposed,
        manualFocusUsable,
        systemAutofocusOnlyLikely,
        testResults,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`Focus test failed: ${msg}`)
      return {
        focusModeApiExposed: false,
        supportedModes: [],
        focusDistanceReported: false,
        focusDistanceControllable: false,
        focusDistanceRange: { min: null, max: null, step: null },
        pointsOfInterestApiExposed: false,
        tapToFocusApiExposed: false,
        manualFocusApiExposed: false,
        manualFocusUsable: 'unknown',
        systemAutofocusOnlyLikely: true,
        testResults: [],
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      if (videoEl) {
        document.body.removeChild(videoEl)
      }
    }
  }, [addLog])

  // Torch/exposure tests
  const runTorchTests = useCallback(async (): Promise<TorchTestResult> => {
    addLog('Testing torch/exposure capabilities...')
    let stream: MediaStream | null = null
    let videoEl: HTMLVideoElement | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      videoEl = document.createElement('video')
      videoEl.autoplay = true
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.style.width = '320px'
      videoEl.style.height = '240px'
      videoEl.style.position = 'absolute'
      videoEl.style.visibility = 'hidden'
      document.body.appendChild(videoEl)
      videoEl.srcObject = stream

      await new Promise<void>((resolve) => {
        videoEl!.onloadedmetadata = () => resolve()
      })

      await new Promise((resolve) => setTimeout(resolve, 500))

      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities()

      const torchApiExposed = 'torch' in capabilities
      const exposureModeApiExposed = 'exposureMode' in capabilities
      const exposureTimeApiExposed = 'exposureTime' in capabilities
      const exposureCompensationApiExposed = 'exposureCompensation' in capabilities
      const whiteBalanceModeApiExposed = 'whiteBalanceMode' in capabilities
      const whiteBalanceModesSupported = (capabilities as ExtendedMediaTrackCapabilities).whiteBalanceMode ?? []
      const brightnessApiExposed = 'brightness' in capabilities
      const contrastApiExposed = 'contrast' in capabilities
      const saturationApiExposed = 'saturation' in capabilities
      const sharpnessApiExposed = 'sharpness' in capabilities
      const isoApiExposed = 'iso' in capabilities

      addLog(`  torch: ${torchApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  exposureMode: ${exposureModeApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  exposureTime: ${exposureTimeApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  exposureCompensation: ${exposureCompensationApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  whiteBalanceMode: ${whiteBalanceModeApiExposed ? 'exposed' : 'not exposed'}`)
      if (whiteBalanceModesSupported.length > 0) {
        addLog(`    Supported modes: ${whiteBalanceModesSupported.join(', ')}`)
      }
      addLog(`  brightness: ${brightnessApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  contrast: ${contrastApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  saturation: ${saturationApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  sharpness: ${sharpnessApiExposed ? 'exposed' : 'not exposed'}`)
      addLog(`  iso: ${isoApiExposed ? 'exposed' : 'not exposed'}`)

      let torchToggleSuccess = false
      if (torchApiExposed) {
        try {
          await track.applyConstraints({ advanced: [{ torch: true }] as ExtendedMediaTrackConstraintSet[] })
          await new Promise((resolve) => setTimeout(resolve, 200))
          await track.applyConstraints({ advanced: [{ torch: false }] as ExtendedMediaTrackConstraintSet[] })
          torchToggleSuccess = true
          addLog('  torch toggle: success')
        } catch (err) {
          addLog(`  torch toggle: failed - ${err}`)
        }
      }

      let whiteBalanceApplySuccess = false
      if (whiteBalanceModeApiExposed && whiteBalanceModesSupported.length > 0) {
        try {
          const mode = whiteBalanceModesSupported[0]
          await track.applyConstraints({ advanced: [{ whiteBalanceMode: mode }] as ExtendedMediaTrackConstraintSet[] })
          whiteBalanceApplySuccess = true
          addLog(`  whiteBalanceMode ${mode}: success`)
        } catch (err) {
          addLog(`  whiteBalanceMode apply: failed - ${err}`)
        }
      }

      return {
        torchApiExposed,
        exposureModeApiExposed,
        exposureTimeApiExposed,
        exposureCompensationApiExposed,
        whiteBalanceModeApiExposed,
        whiteBalanceModesSupported,
        whiteBalanceApplySuccess,
        brightnessApiExposed,
        contrastApiExposed,
        saturationApiExposed,
        sharpnessApiExposed,
        isoApiExposed,
        torchToggleSuccess,
        error: null,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`Torch test failed: ${msg}`)
      return {
        torchApiExposed: false,
        exposureModeApiExposed: false,
        exposureTimeApiExposed: false,
        exposureCompensationApiExposed: false,
        whiteBalanceModeApiExposed: false,
        whiteBalanceModesSupported: [],
        whiteBalanceApplySuccess: false,
        brightnessApiExposed: false,
        contrastApiExposed: false,
        saturationApiExposed: false,
        sharpnessApiExposed: false,
        isoApiExposed: false,
        torchToggleSuccess: false,
        error: msg,
      }
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      if (videoEl) {
        document.body.removeChild(videoEl)
      }
    }
  }, [addLog])

  // File input handler
  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      addLog(`File input selected: ${file.name}`)

      try {
        const bitmap = await createImageBitmap(file)
        const result: FileInputResult = {
          mimeType: file.type,
          byteSize: file.size,
          width: bitmap.width,
          height: bitmap.height,
          exifOrientationNeeded: false, // Would need EXIF library to detect
          error: null,
        }
        setFileInputResult(result)
        addLog(`  MIME: ${file.type}, Size: ${(file.size / 1024).toFixed(0)} KB, Dimensions: ${bitmap.width}x${bitmap.height}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setFileInputResult({
          mimeType: file.type,
          byteSize: file.size,
          width: 0,
          height: 0,
          exifOrientationNeeded: false,
          error: msg,
        })
        addLog(`  Failed: ${msg}`)
      }
    },
    [addLog],
  )

  // High-resolution device tests
  const runHighResDeviceTests = useCallback(
    async (devices: DeviceInfo[]): Promise<HighResDeviceTestResult[]> => {
      const rearDevices = devices.filter((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'))
      const results: HighResDeviceTestResult[] = []

      for (const device of rearDevices) {
        addLog(`Testing high-res capture for device: ${device.label}`)
        const deviceResult: HighResDeviceTestResult = {
          deviceId: device.deviceId,
          label: device.label,
          tests: [],
        }

        const resolutions = [
          { name: '1920x1440 (4:3)', width: 1920, height: 1440 },
          { name: '1920x1080 (16:9)', width: 1920, height: 1080 },
          { name: '3024x4032', width: 3024, height: 4032 },
        ]

        for (const res of resolutions) {
          addLog(`  Testing ${res.name}...`)
          let stream: MediaStream | null = null
          let videoEl: HTMLVideoElement | null = null

          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: device.deviceId },
                width: { ideal: res.width },
                height: { ideal: res.height },
              },
              audio: false,
            })
            videoEl = document.createElement('video')
            videoEl.autoplay = true
            videoEl.muted = true
            videoEl.playsInline = true
            videoEl.style.width = '320px'
            videoEl.style.height = '240px'
            videoEl.style.position = 'absolute'
            videoEl.style.visibility = 'hidden'
            document.body.appendChild(videoEl)
            videoEl.srcObject = stream

            await new Promise<void>((resolve) => {
              videoEl!.onloadedmetadata = () => resolve()
            })

            await new Promise((resolve) => setTimeout(resolve, 500))

            const track = stream.getVideoTracks()[0]

            // Test takePhoto
            let takePhotoSuccess = false
            let takePhotoWidth = 0
            let takePhotoHeight = 0
            let takePhotoSize = 0

            if (typeof ImageCapture !== 'undefined') {
              try {
                const imageCapture = new ImageCapture(track)
                const blob = await imageCapture.takePhoto()
                const bitmap = await createImageBitmap(blob)
                takePhotoSuccess = true
                takePhotoWidth = bitmap.width
                takePhotoHeight = bitmap.height
                takePhotoSize = blob.size
              } catch {
                // takePhoto failed
              }
            }

            // Test grabFrame
            let grabFrameSuccess = false
            let grabFrameWidth = 0
            let grabFrameHeight = 0
            let grabFrameSize = 0

            if (typeof ImageCapture !== 'undefined') {
              try {
                const imageCapture = new ImageCapture(track)
                const bitmap = await imageCapture.grabFrame()
                const blob = await bitmapToBlob(bitmap)
                grabFrameSuccess = true
                grabFrameWidth = bitmap.width
                grabFrameHeight = bitmap.height
                grabFrameSize = blob.size
              } catch {
                // grabFrame failed
              }
            }

            // Test canvas capture
            let canvasSuccess = false
            let canvasWidth = 0
            let canvasHeight = 0
            let canvasSize = 0

            try {
              const canvas = document.createElement('canvas')
              canvas.width = videoEl.videoWidth
              canvas.height = videoEl.videoHeight
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(videoEl, 0, 0)
                const blob = await new Promise<Blob>((resolve) => {
                  canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
                })
                canvasSuccess = true
                canvasWidth = canvas.width
                canvasHeight = canvas.height
                canvasSize = blob.size
              }
            } catch {
              // canvas failed
            }

            deviceResult.tests.push({
              resolution: res.name,
              constraints: {
                video: {
                  deviceId: { exact: device.deviceId },
                  width: { ideal: res.width },
                  height: { ideal: res.height },
                },
                audio: false,
              },
              success: true,
              videoWidth: videoEl.videoWidth,
              videoHeight: videoEl.videoHeight,
              takePhotoSuccess,
              takePhotoWidth,
              takePhotoHeight,
              takePhotoSize,
              grabFrameSuccess,
              grabFrameWidth,
              grabFrameHeight,
              grabFrameSize,
              canvasSuccess,
              canvasWidth,
              canvasHeight,
              canvasSize,
              error: null,
            })

            addLog(`    Actual: ${videoEl.videoWidth}x${videoEl.videoHeight}, takePhoto: ${takePhotoSuccess}, grabFrame: ${grabFrameSuccess}, canvas: ${canvasSuccess}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            deviceResult.tests.push({
              resolution: res.name,
              constraints: {
                video: {
                  deviceId: { exact: device.deviceId },
                  width: { ideal: res.width },
                  height: { ideal: res.height },
                },
                audio: false,
              },
              success: false,
              videoWidth: 0,
              videoHeight: 0,
              takePhotoSuccess: false,
              takePhotoWidth: 0,
              takePhotoHeight: 0,
              takePhotoSize: 0,
              grabFrameSuccess: false,
              grabFrameWidth: 0,
              grabFrameHeight: 0,
              grabFrameSize: 0,
              canvasSuccess: false,
              canvasWidth: 0,
              canvasHeight: 0,
              canvasSize: 0,
              error: msg,
            })
            addLog(`    Failed: ${msg}`)
          } finally {
            if (stream) {
              stream.getTracks().forEach((t) => t.stop())
            }
            if (videoEl) {
              document.body.removeChild(videoEl)
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 300))
        }

        results.push(deviceResult)
      }

      return results
    },
    [addLog],
  )

  // Per-device zoom tests
  const runPerDeviceZoomTests = useCallback(
    async (devices: DeviceInfo[]): Promise<PerDeviceZoomTestResult[]> => {
      const rearDevices = devices.filter((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'))
      const results: PerDeviceZoomTestResult[] = []

      for (const device of rearDevices) {
        addLog(`Testing zoom for device: ${device.label}`)
        let stream: MediaStream | null = null
        let videoEl: HTMLVideoElement | null = null

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: device.deviceId },
              facingMode: { ideal: 'environment' },
            },
            audio: false,
          })
          videoEl = document.createElement('video')
          videoEl.autoplay = true
          videoEl.muted = true
          videoEl.playsInline = true
          videoEl.style.width = '320px'
          videoEl.style.height = '240px'
          videoEl.style.position = 'absolute'
          videoEl.style.visibility = 'hidden'
          document.body.appendChild(videoEl)
          videoEl.srcObject = stream

          await new Promise<void>((resolve) => {
            videoEl!.onloadedmetadata = () => resolve()
          })

          await new Promise((resolve) => setTimeout(resolve, 500))

          const track = stream.getVideoTracks()[0]
          const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities
          const settings = track.getSettings() as ExtendedMediaTrackSettings

          const zoomCap = capabilities.zoom
          const zoomApiExposed = !!zoomCap
          const min = zoomCap?.min ?? null
          const max = zoomCap?.max ?? null
          const step = zoomCap?.step ?? null
          const current = settings.zoom ?? null

          addLog(`  Zoom API: ${zoomApiExposed ? 'exposed' : 'not exposed'}`)
          if (zoomApiExposed && zoomCap) {
            addLog(`    Range: min=${min}, max=${max}, step=${step}, current=${current}`)
          }

          const applyResults: {
            value: number
            success: boolean
            resultingZoom: number | null
            error: string | null
          }[] = []

          if (zoomApiExposed && zoomCap && min !== null && max !== null) {
            const testValues = [min, 1, min + (max - min) / 2, max]
            for (const value of testValues) {
              try {
                await track.applyConstraints({ advanced: [{ zoom: value }] as ExtendedMediaTrackConstraintSet[] })
                const newSettings = track.getSettings() as ExtendedMediaTrackSettings
                const resultingZoom = newSettings.zoom ?? null
                applyResults.push({ value, success: true, resultingZoom, error: null })
                addLog(`    Apply zoom ${value.toFixed(2)}: success -> ${resultingZoom}`)
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                applyResults.push({ value, success: false, resultingZoom: null, error: msg })
                addLog(`    Apply zoom ${value.toFixed(2)}: failed - ${msg}`)
              }
            }
          }

          results.push({
            deviceId: device.deviceId,
            label: device.label,
            zoomApiExposed,
            min,
            max,
            step,
            current,
            applyResults,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          addLog(`  Zoom test failed: ${msg}`)
          results.push({
            deviceId: device.deviceId,
            label: device.label,
            zoomApiExposed: false,
            min: null,
            max: null,
            step: null,
            current: null,
            applyResults: [],
          })
        } finally {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
          }
          if (videoEl) {
            document.body.removeChild(videoEl)
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      return results
    },
    [addLog],
  )

  // Run full sweep
  const runFullSweep = useCallback(async () => {
    if (running) return
    setRunning(true)
    logRef.current = []
    setLog([])
    setReport(null)

    try {
      addLog('=== Starting Full Capability Sweep ===')

      // Context diagnostics
      addLog('Collecting context diagnostics...')
      const context = collectContextDiagnostics()
      addLog(`  User agent: ${context.userAgent.slice(0, 50)}...`)
      addLog(`  Secure context: ${context.isSecureContext}`)
      addLog(`  ImageCapture available: ${context.imageCaptureAvailable}`)

      // Device enumeration
      const devices = await enumerateDevicesWithPermission()

      // Stream preset sweep
      addLog('Running stream preset sweep...')
      const streamTests = await runStreamPresetSweep()

      // DeviceId sweep
      addLog('Running deviceId sweep...')
      const deviceIdTests = await runDeviceIdSweep(devices)

      // Capture method tests
      addLog('Running capture method tests...')
      const captureMethodTests = await runCaptureMethodTests()

      // Aspect ratio tests
      addLog('Running aspect ratio tests...')
      const aspectRatioTests = await runAspectRatioTests()

      // Zoom tests
      const zoomTest = await runZoomTests()

      // Focus tests
      const focusTest = await runFocusTests()

      // Torch tests
      const torchTest = await runTorchTests()

      // High-resolution device tests
      addLog('Running high-resolution device tests...')
      const highResDeviceTests = await runHighResDeviceTests(devices)

      // Per-device zoom tests
      addLog('Running per-device zoom tests...')
      const perDeviceZoomTests = await runPerDeviceZoomTests(devices)

      // Build summary
      const summary = {
        getUserMedia: context.getUserMediaPresent,
        enumerateDevices: context.enumerateDevicesPresent,
        videoInputCount: devices.length,
        imageCaptureTakePhoto: captureMethodTests.some((r) => r.method === 'takePhoto' && r.success),
        imageCaptureGrabFrame: captureMethodTests.some((r) => r.method === 'grabFrame' && r.success),
        canvasCapture: captureMethodTests.some((r) => r.method === 'canvas' && r.success),
        nativeSquareAspectRatio: aspectRatioTests.some((r) => r.requestedAspectRatio === 1 && r.nativeSquareLikelySupported),
        zoomApi: zoomTest.zoomApiExposed,
        focusModeApi: focusTest.focusModeApiExposed,
        focusDistanceApi: focusTest.focusDistanceReported,
        pointsOfInterestApi: focusTest.pointsOfInterestApiExposed,
        torchApi: torchTest.torchApiExposed,
        multipleRearDevicesExposed: devices.length > 1,
      }

      // Build capability matrix
      const rearDevices = devices.filter((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'))
      const ultraWideExposed = rearDevices.some((d) => d.label.toLowerCase().includes('ultra wide'))
      const telephotoExposed = rearDevices.some((d) => d.label.toLowerCase().includes('telephoto'))

      const videoDims = streamTests.map((t) => `${t.videoWidth}x${t.videoHeight}`)
      const highestVideoRes = videoDims.sort((a, b) => {
        const [wa, ha] = a.split('x').map(Number)
        const [wb, hb] = b.split('x').map(Number)
        return wb * hb - wa * ha
      })[0] || 'none'

      const takePhotoDims = captureMethodTests
        .filter((t) => t.method === 'takePhoto' && t.success)
        .map((t) => `${t.naturalWidth}x${t.naturalHeight}`)
      const highestTakePhotoRes = takePhotoDims.sort((a, b) => {
        const [wa, ha] = a.split('x').map(Number)
        const [wb, hb] = b.split('x').map(Number)
        return wb * hb - wa * ha
      })[0] || 'none'

      const canvasDims = captureMethodTests
        .filter((t) => t.method === 'canvas' && t.success)
        .map((t) => `${t.naturalWidth}x${t.naturalHeight}`)
      const highestCanvasRes = canvasDims.sort((a, b) => {
        const [wa, ha] = a.split('x').map(Number)
        const [wb, hb] = b.split('x').map(Number)
        return wb * hb - wa * ha
      })[0] || 'none'

      const squareTests = aspectRatioTests.filter((t) => t.requestedAspectRatio === 1)
      const squareNativeWorks = squareTests.some((t) => t.nativeSquareLikelySupported)
      const squareHighestRes = squareTests
        .filter((t) => t.nativeSquareLikelySupported)
        .map((t) => `${t.actualWidth}x${t.actualHeight}`)
        .sort((a, b) => {
          const [wa, ha] = a.split('x').map(Number)
          const [wb, hb] = b.split('x').map(Number)
          return wb * hb - wa * ha
        })[0] || 'none'

      const capabilityMatrix = {
        multipleRearDevicesExposed: rearDevices.length > 1,
        ultraWideDeviceLabelExposed: ultraWideExposed,
        telephotoDeviceLabelExposed: telephotoExposed,
        highResVideoStreamWorks: parseInt(highestVideoRes.split('x')[0]) >= 1920,
        highestObservedVideoDimensions: highestVideoRes,
        highestObservedTakePhotoDimensions: highestTakePhotoRes,
        highestObservedCanvasDimensions: highestCanvasRes,
        squareNativeStreamWorks: squareNativeWorks,
        squareNativeHighestObservedDimensions: squareHighestRes,
        zoomCapabilityReported: zoomTest.zoomApiExposed,
        zoomApplyWorks: zoomTest.applyMinSuccess || zoomTest.applyMidSuccess || zoomTest.applyMaxSuccess,
        torchReported: torchTest.torchApiExposed,
        torchApplyWorks: torchTest.torchToggleSuccess,
        focusDistanceReported: focusTest.focusDistanceReported,
        focusDistanceApplyWorks: focusTest.focusDistanceControllable === true,
        tapToFocusExposed: focusTest.tapToFocusApiExposed,
        manualFocusUsable: focusTest.manualFocusUsable,
        fileInputFallbackTested: fileInputResult !== null,
        fileInputObservedDimensions: fileInputResult ? `${fileInputResult.width}x${fileInputResult.height}` : 'none',
      }

      // Create white balance test result from torch test
      const whiteBalanceTest: WhiteBalanceTestResult = {
        whiteBalanceModeApiExposed: torchTest.whiteBalanceModeApiExposed,
        supportedModes: torchTest.whiteBalanceModesSupported,
        applyContinuousSuccess: torchTest.whiteBalanceApplySuccess,
        applyManualSuccess: false,
        error: null,
      }

      const fullReport: DiagnosticsReport = {
        timestamp: new Date().toISOString(),
        context,
        devices,
        streamTests,
        deviceIdTests,
        captureMethodTests,
        aspectRatioTests,
        zoomTest,
        focusTest,
        torchTest,
        whiteBalanceTest,
        highResDeviceTests,
        perDeviceZoomTests,
        fileInputResult,
        summary,
        capabilityMatrix,
      }

      setReport(fullReport)
      addLog('=== Sweep Complete ===')
    } catch (err) {
      addLog(`Sweep failed: ${err}`)
    } finally {
      setRunning(false)
    }
  }, [
    running,
    addLog,
    collectContextDiagnostics,
    enumerateDevicesWithPermission,
    runStreamPresetSweep,
    runDeviceIdSweep,
    runCaptureMethodTests,
    runAspectRatioTests,
    runZoomTests,
    runFocusTests,
    runTorchTests,
    runHighResDeviceTests,
    runPerDeviceZoomTests,
    fileInputResult,
  ])

  const copyDiagnosticsJson = useCallback(() => {
    if (!report) return
    const json = JSON.stringify(report, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      addLog('Diagnostics JSON copied to clipboard')
    })
  }, [report, addLog])

  const downloadDiagnosticsJson = useCallback(() => {
    if (!report) return
    const json = JSON.stringify(report, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `camera-lab-diagnostics-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    addLog('Diagnostics JSON downloaded')
  }, [report, addLog])

  return (
    <div style={s.screen}>
      <div style={s.header}>
        <span style={s.title}>Raw Camera Lab — Phase 0 Diagnostic</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Actions</div>
        <button style={{ ...s.btn, ...s.primaryBtn }} onClick={runFullSweep} disabled={running}>
          {running ? 'Running Full Capability Sweep…' : 'Run Full Capability Sweep'}
        </button>

        {report && (
          <>
            <button style={{ ...s.btn, ...s.secondaryBtn, marginTop: 8 }} onClick={copyDiagnosticsJson}>
              Copy Diagnostics JSON
            </button>
            <button style={{ ...s.btn, ...s.secondaryBtn, marginTop: 8 }} onClick={downloadDiagnosticsJson}>
              Download Diagnostics JSON
            </button>
          </>
        )}

        <button style={{ ...s.btn, ...s.dangerBtn, marginTop: 8 }} onClick={clearSamples} disabled={samples.length === 0}>
          Clear Lab Samples ({samples.length})
        </button>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>File Input Fallback Diagnostic</div>
        <input type="file" accept="image/*" capture="environment" onChange={handleFileInput} style={{ color: '#ddd' }} />
        {fileInputResult && (
          <div style={{ marginTop: 8 }}>
            <div style={s.label}>MIME Type:</div>
            <div style={s.value}>{fileInputResult.mimeType}</div>
            <div style={s.label}>Size:</div>
            <div style={s.value}>{(fileInputResult.byteSize / 1024).toFixed(0)} KB</div>
            <div style={s.label}>Dimensions:</div>
            <div style={s.value}>{fileInputResult.width}x{fileInputResult.height}</div>
            {fileInputResult.error && (
              <div style={{ ...s.label, color: '#ef4444' }}>Error: {fileInputResult.error}</div>
            )}
          </div>
        )}
      </div>

      {report && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Summary</div>
          <table style={s.summaryTable}>
            <tbody>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>getUserMedia</td>
                <td style={{ ...s.summaryCell, ...(report.summary.getUserMedia ? s.statusPass : s.statusFail) }}>
                  {report.summary.getUserMedia ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>enumerateDevices</td>
                <td style={{ ...s.summaryCell, ...(report.summary.enumerateDevices ? s.statusPass : s.statusFail) }}>
                  {report.summary.enumerateDevices ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Video Inputs</td>
                <td style={s.summaryCell}>{report.summary.videoInputCount}</td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>ImageCapture takePhoto</td>
                <td style={{ ...s.summaryCell, ...(report.summary.imageCaptureTakePhoto ? s.statusPass : s.statusFail) }}>
                  {report.summary.imageCaptureTakePhoto ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>ImageCapture grabFrame</td>
                <td style={{ ...s.summaryCell, ...(report.summary.imageCaptureGrabFrame ? s.statusPass : s.statusFail) }}>
                  {report.summary.imageCaptureGrabFrame ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Canvas Capture</td>
                <td style={{ ...s.summaryCell, ...(report.summary.canvasCapture ? s.statusPass : s.statusFail) }}>
                  {report.summary.canvasCapture ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Native Square Aspect Ratio</td>
                <td style={{ ...s.summaryCell, ...(report.summary.nativeSquareAspectRatio ? s.statusPass : s.statusFail) }}>
                  {report.summary.nativeSquareAspectRatio ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Zoom API</td>
                <td style={{ ...s.summaryCell, ...(report.summary.zoomApi ? s.statusPass : s.statusFail) }}>
                  {report.summary.zoomApi ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>FocusMode API</td>
                <td style={{ ...s.summaryCell, ...(report.summary.focusModeApi ? s.statusPass : s.statusFail) }}>
                  {report.summary.focusModeApi ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>FocusDistance API</td>
                <td style={{ ...s.summaryCell, ...(report.summary.focusDistanceApi ? s.statusPass : s.statusFail) }}>
                  {report.summary.focusDistanceApi ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>PointsOfInterest API</td>
                <td style={{ ...s.summaryCell, ...(report.summary.pointsOfInterestApi ? s.statusPass : s.statusFail) }}>
                  {report.summary.pointsOfInterestApi ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Torch API</td>
                <td style={{ ...s.summaryCell, ...(report.summary.torchApi ? s.statusPass : s.statusFail) }}>
                  {report.summary.torchApi ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Multiple Rear Devices</td>
                <td style={{ ...s.summaryCell, ...(report.summary.multipleRearDevicesExposed ? s.statusPass : s.statusFail) }}>
                  {report.summary.multipleRearDevicesExposed ? '✓' : '✗'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {report && report.capabilityMatrix && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Capability Matrix</div>
          <table style={s.summaryTable}>
            <tbody>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Multiple Rear Devices</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.multipleRearDevicesExposed ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.multipleRearDevicesExposed ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Ultra Wide Label</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.ultraWideDeviceLabelExposed ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.ultraWideDeviceLabelExposed ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Telephoto Label</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.telephotoDeviceLabelExposed ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.telephotoDeviceLabelExposed ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>High-Res Video (≥1920)</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.highResVideoStreamWorks ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.highResVideoStreamWorks ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Highest Video</td>
                <td style={s.summaryCell}>{report.capabilityMatrix.highestObservedVideoDimensions}</td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Highest takePhoto</td>
                <td style={s.summaryCell}>{report.capabilityMatrix.highestObservedTakePhotoDimensions}</td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Highest Canvas</td>
                <td style={s.summaryCell}>{report.capabilityMatrix.highestObservedCanvasDimensions}</td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Square Native Stream</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.squareNativeStreamWorks ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.squareNativeStreamWorks ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Square Highest</td>
                <td style={s.summaryCell}>{report.capabilityMatrix.squareNativeHighestObservedDimensions}</td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Zoom Reported</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.zoomCapabilityReported ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.zoomCapabilityReported ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Zoom Apply Works</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.zoomApplyWorks ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.zoomApplyWorks ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Torch Reported</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.torchReported ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.torchReported ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Torch Apply Works</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.torchApplyWorks ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.torchApplyWorks ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>FocusDistance Reported</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.focusDistanceReported ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.focusDistanceReported ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>FocusDistance Apply</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.focusDistanceApplyWorks ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.focusDistanceApplyWorks ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Tap-to-Focus</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.tapToFocusExposed ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.tapToFocusExposed ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>Manual Focus Usable</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.manualFocusUsable === true ? s.statusPass : report.capabilityMatrix.manualFocusUsable === false ? s.statusFail : s.statusWarn) }}>
                  {report.capabilityMatrix.manualFocusUsable === true ? '✓' : report.capabilityMatrix.manualFocusUsable === false ? '✗' : '?'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>File Input Tested</td>
                <td style={{ ...s.summaryCell, ...(report.capabilityMatrix.fileInputFallbackTested ? s.statusPass : s.statusFail) }}>
                  {report.capabilityMatrix.fileInputFallbackTested ? '✓' : '✗'}
                </td>
              </tr>
              <tr>
                <td style={{ ...s.summaryCell, ...s.summaryHeader }}>File Input Dimensions</td>
                <td style={s.summaryCell}>{report.capabilityMatrix.fileInputObservedDimensions}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {report && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Sample Thumbnails</div>
          <div style={s.thumbnailGrid}>
            {samples.map((sample) => (
              <div key={sample.id} style={{ textAlign: 'center' }}>
                <img src={sample.dataUrl} alt={sample.category} style={s.thumbnail} />
                <div style={{ fontSize: 9, color: '#666', marginTop: 2, wordBreak: 'break-all' }}>
                  {sample.category.slice(0, 12)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>Log</div>
        <div style={s.log}>{log.join('\n')}</div>
      </div>
    </div>
  )
}

// Helper functions
async function bitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context')
  ctx.drawImage(bitmap, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob returned null'))
      },
      'image/jpeg',
      0.92,
    )
  })
}

async function bitmapToDataUrl(bitmap: ImageBitmap, maxWidth: number, maxHeight: number): Promise<string> {
  const canvas = document.createElement('canvas')
  const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1)
  canvas.width = bitmap.width * scale
  canvas.height = bitmap.height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.7)
}
