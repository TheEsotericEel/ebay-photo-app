// ImageCapture is not fully typed in all TS DOM lib versions.
// takePhoto() is preferred for high-resolution still capture on iPhone Safari.
// grabFrame() exists at runtime on Safari/Chrome and is used as a fallback
// before the canvas fallback.
declare class ImageCapture {
  constructor(track: MediaStreamTrack)
  grabFrame(): Promise<ImageBitmap>
  takePhoto(): Promise<Blob>
}

export interface CapturedFrame {
  blob: Blob
  width: number
  height: number
  capturedAt: string
  diagnostics?: CaptureDiagnostics
}

export interface CaptureDiagnostics {
  initialStreamWidth?: number
  initialStreamHeight?: number
  capabilitiesWidthMax?: number
  capabilitiesHeightMax?: number
  previewQualityAttempted?: boolean
  previewQualityRequestedConstraints?: string[]
  previewQualityApplied?: boolean
  previewQualityError?: string
  previewQualityTrackSettings?: TrackSettings
  maxConstraintCandidatesAttempted?: string[]
  finalStreamWidth?: number
  finalStreamHeight?: number
  takePhotoWidth?: number
  takePhotoHeight?: number
  processedWidth?: number
  processedHeight?: number
  processedByteSize?: number
  captureMethod?: 'takePhoto' | 'grabFrame' | 'canvas'
  trackSettings?: TrackSettings
  trackCapabilities?: MediaTrackCapabilities | null
  originalMimeType?: string
  originalByteSize?: number
  downscaledFromOriginal?: boolean
  upscaleRisk?: boolean
  errors?: string[]
  // Shutter-time upgrade diagnostics
  preCaptureTrackSettings?: TrackSettings
  takePhotoFirstAttemptSuccess?: boolean
  takePhotoFirstAttemptError?: string
  highResUpgradeAttempted?: boolean
  highResConstraintCandidatesAttempted?: string[]
  postUpgradeTrackSettings?: TrackSettings
  takePhotoRetrySuccess?: boolean
  takePhotoRetryError?: string
  selectedRatio?: 'full' | '1:1' | '4:3' | '16:9'
}

export interface TrackSettings {
  width: number | undefined
  height: number | undefined
  aspectRatio: number | undefined
  facingMode: string | undefined
  deviceId: string | undefined
  zoom: number | undefined
  torch: boolean | undefined
  focusMode: string | undefined
  focusDistance: number | undefined
  exposureMode: string | undefined
  exposureTime: number | undefined
  exposureCompensation: number | undefined
  whiteBalanceMode: string | undefined
  brightness: number | undefined
  contrast: number | undefined
  saturation: number | undefined
  sharpness: number | undefined
  iso: number | undefined
  frameRate: number | undefined
}

export interface CameraCapabilities {
  zoom: boolean
  torch: boolean
  focusMode: string[]
  facingModes: string[]
  deviceLabels: string[]
  raw: MediaTrackCapabilities | null
  trackSettings: TrackSettings | null
}

export interface CameraDeviceInfo {
  kind: string
  deviceId: string
  label: string
  groupId: string
}

export interface CameraTestConstraintSet extends MediaTrackConstraintSet {
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

export interface CameraAdapter {
  start(videoEl: HTMLVideoElement): Promise<void>
  stop(): void
  captureFrame(): Promise<CapturedFrame>
  getCapabilities(): CameraCapabilities | null
}

export class BrowserCameraAdapter implements CameraAdapter {
  private stream: MediaStream | null = null
  private videoEl: HTMLVideoElement | null = null
  private track: MediaStreamTrack | null = null
  private capabilities: CameraCapabilities | null = null
  private diagnostics: CaptureDiagnostics = {}

  async start(videoEl: HTMLVideoElement): Promise<void> {
    if (this.stream) {
      this.stop()
    }

    if (!window.isSecureContext) {
      throw new Error(
        'Camera API unavailable. This app is not running in a secure context. ' +
          'Use HTTPS, localhost, or a trusted tunnel (e.g. cloudflared, ngrok). ' +
          'Plain http://LAN-IP will not work for camera access on iPhone Safari.',
      )
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera API unavailable. navigator.mediaDevices.getUserMedia is not present. ' +
          'This usually means the page is not running in a secure context (HTTPS or localhost). ' +
          'Use a trusted HTTPS tunnel to test on iPhone.',
      )
    }

    // Stage A: Open rear camera with minimal constraints to get capabilities and deviceId
    const initialConstraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    }

    let stream = await navigator.mediaDevices.getUserMedia(initialConstraints)
    this.stream = stream
    this.videoEl = videoEl
    videoEl.srcObject = stream
    await videoEl.play()

    const track = stream.getVideoTracks()[0]
    if (!track) {
      throw new Error('No video track available')
    }
    this.track = track

    // Record initial stream dimensions
    this.diagnostics.initialStreamWidth = videoEl.videoWidth
    this.diagnostics.initialStreamHeight = videoEl.videoHeight
    console.log(`Stage A - Initial stream: ${videoEl.videoWidth}x${videoEl.videoHeight}`)

    // Probe capabilities
    this.capabilities = probeCapabilities(track, videoEl)

    // Record capabilities max dimensions
    const rawCaps = this.capabilities.raw as MediaTrackCapabilities & {
      width?: { min: number; max: number; step: number }
      height?: { min: number; max: number; step: number }
    }
    this.diagnostics.capabilitiesWidthMax = rawCaps.width?.max
    this.diagnostics.capabilitiesHeightMax = rawCaps.height?.max
    console.log(`Stage A - Capabilities max: ${rawCaps.width?.max}x${rawCaps.height?.max}`)

    await this.applyBestEffortPreviewQualityUpgrade(track)

    this.capabilities = probeCapabilities(track, videoEl)
    this.diagnostics.finalStreamWidth = videoEl.videoWidth
    this.diagnostics.finalStreamHeight = videoEl.videoHeight
    console.log(`Stage A - Final stream after preview quality pass: ${videoEl.videoWidth}x${videoEl.videoHeight}`)
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.track = null
    this.videoEl = null
    this.capabilities = null
  }

  // Temporarily disabled - keep preview lightweight
  // Re-enable if evidence shows takePhoto returns low-res from low-res preview
  /*
  private async applyMaxDimensionsWithRestart(
    track: MediaStreamTrack,
    deviceId: string,
    maxWidth: number,
    maxHeight: number,
    videoEl: HTMLVideoElement,
  ): Promise<void> {
    const candidatesAttempted: string[] = []
    const errors: string[] = []

    // Build fallback ladder: capabilities max → common high-res candidates → normal fallback
    const candidates = [
      // Try capabilities max in both orientations (iOS reports dimensions inconsistently)
      { width: maxWidth, height: maxHeight, name: `caps-max-${maxWidth}x${maxHeight}` },
      { width: maxHeight, height: maxWidth, name: `caps-max-${maxHeight}x${maxWidth}` },
      // Common iPhone high-res portrait candidates
      { width: 3024, height: 4032, name: '3024x4032-portrait' },
      { width: 4032, height: 3024, name: '4032x3024-landscape' },
      // Fallback high-res candidates
      { width: 1920, height: 1440, name: '1920x1440-4:3' },
      { width: 1440, height: 1920, name: '1440x1920-4:3-portrait' },
    ]

    let bestCandidate: typeof candidates[0] | null = null
    let bestPixelCount = 0

    for (const candidate of candidates) {
      candidatesAttempted.push(candidate.name)
      console.log(`Stage B - Attempting candidate: ${candidate.name}`)

      try {
        // First try applyConstraints on existing track
        await track.applyConstraints({
          advanced: [
            {
              width: { ideal: candidate.width },
              height: { ideal: candidate.height },
            },
          ] as MediaTrackConstraintSet[],
        })

        // Check if the stream dimensions improved
        await new Promise((resolve) => setTimeout(resolve, 100)) // Small delay for constraints to take effect
        const pixelCount = videoEl.videoWidth * videoEl.videoHeight
        console.log(`Stage B - After applyConstraints: ${videoEl.videoWidth}x${videoEl.videoHeight} (${pixelCount}px)`)

        if (pixelCount > bestPixelCount) {
          bestPixelCount = pixelCount
          bestCandidate = candidate
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`Stage B - Candidate ${candidate.name} failed: ${msg}`)
        errors.push(`${candidate.name}: ${msg}`)
      }
    }

    this.diagnostics.maxConstraintCandidatesAttempted = candidatesAttempted
    this.diagnostics.errors = errors

    // If applyConstraints didn't upgrade the stream significantly, try restarting with deviceId
    if (bestPixelCount < maxWidth * maxHeight * 0.5) {
      console.log(`Stage B - applyConstraints insufficient, restarting with deviceId and best candidate`)
      
      // Stop current stream
      this.stream?.getTracks().forEach((t) => t.stop())
      
      // Restart with deviceId and best max-ideal constraints
      const bestCandidateForRestart = bestCandidate || candidates[0]
      const restartConstraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: bestCandidateForRestart.width },
          height: { ideal: bestCandidateForRestart.height },
        },
        audio: false,
      }

      try {
        const newStream = await navigator.mediaDevices.getUserMedia(restartConstraints)
        this.stream = newStream
        videoEl.srcObject = newStream
        await videoEl.play()
        
        // Re-probe capabilities with new stream
        const newTrack = newStream.getVideoTracks()[0]
        if (newTrack) {
          this.capabilities = probeCapabilities(newTrack, videoEl)
        }
        
        console.log(`Stage B - Restart successful: ${videoEl.videoWidth}x${videoEl.videoHeight}`)
      } catch (err) {
        console.warn(`Stage B - Restart failed, falling back to initial stream: ${err}`)
        // Fallback: restart with deviceId only (no resolution constraints)
        const fallbackConstraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: deviceId },
          },
          audio: false,
        }
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
          this.stream = fallbackStream
          videoEl.srcObject = fallbackStream
          await videoEl.play()
          
          const fallbackTrack = fallbackStream.getVideoTracks()[0]
          if (fallbackTrack) {
            this.capabilities = probeCapabilities(fallbackTrack, videoEl)
          }
          
          console.log(`Stage B - Fallback stream: ${videoEl.videoWidth}x${videoEl.videoHeight}`)
        } catch (fallbackErr) {
          console.error(`Stage B - Fallback also failed: ${fallbackErr}`)
        }
      }
    }

    // Record final stream dimensions
    this.diagnostics.finalStreamWidth = videoEl.videoWidth
    this.diagnostics.finalStreamHeight = videoEl.videoHeight
    console.log(`Stage B - Final stream: ${videoEl.videoWidth}x${videoEl.videoHeight}`)
  }
  */

  async captureFrame(): Promise<CapturedFrame> {
    if (!this.stream) {
      throw new Error('Camera not started')
    }

    const track = this.stream.getVideoTracks()[0]
    if (!track) {
      throw new Error('No video track available')
    }

    // Clone stream-level diagnostics for this capture
    const captureDiagnostics: CaptureDiagnostics = {
      ...this.diagnostics,
      trackSettings: this.capabilities?.trackSettings || undefined,
      trackCapabilities: this.capabilities?.raw || null,
      preCaptureTrackSettings: readTrackSettings(track),
    }

    const TARGET_MIN = 1200 // Each axis must be at least this for clean downscale

    // ── Step 1: First takePhoto attempt on current (low-res preview) stream ──
    if (typeof ImageCapture !== 'undefined') {
      try {
        const imageCapture = new ImageCapture(track)
        const blob = await imageCapture.takePhoto()
        const bitmap = await createImageBitmap(blob)
        const width = bitmap.width
        const height = bitmap.height
        bitmap.close()
        console.log(`takePhoto (first attempt): ${width}x${height}`)
        captureDiagnostics.takePhotoFirstAttemptSuccess = true
        captureDiagnostics.takePhotoWidth = width
        captureDiagnostics.takePhotoHeight = height

        // If dimensions are adequate, return immediately — no upgrade needed
        if (width >= TARGET_MIN && height >= TARGET_MIN) {
          captureDiagnostics.highResUpgradeAttempted = false
          captureDiagnostics.captureMethod = 'takePhoto'
          captureDiagnostics.originalMimeType = blob.type
          captureDiagnostics.originalByteSize = blob.size
          return { blob, width, height, capturedAt: new Date().toISOString(), diagnostics: captureDiagnostics }
        }

        // Dimensions are below target — attempt high-res upgrade before returning
        console.log(`takePhoto first attempt below target (${width}x${height} < ${TARGET_MIN}), attempting high-res upgrade`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`takePhoto first attempt failed: ${msg}`)
        captureDiagnostics.takePhotoFirstAttemptSuccess = false
        captureDiagnostics.takePhotoFirstAttemptError = msg
      }
    } else {
      // ImageCapture not available at all — skip to fallback
      captureDiagnostics.takePhotoFirstAttemptSuccess = false
      captureDiagnostics.takePhotoFirstAttemptError = 'ImageCapture not available'
    }

    // ── Step 2: High-res track upgrade ──
    await attemptHighResUpgrade(track, captureDiagnostics)

    // ── Step 3: Retry takePhoto after upgrade ──
    if (typeof ImageCapture !== 'undefined') {
      try {
        const imageCapture = new ImageCapture(track)
        const blob = await imageCapture.takePhoto()
        const bitmap = await createImageBitmap(blob)
        const width = bitmap.width
        const height = bitmap.height
        bitmap.close()
        console.log(`takePhoto (retry after upgrade): ${width}x${height}`)
        captureDiagnostics.takePhotoRetrySuccess = true
        captureDiagnostics.takePhotoWidth = width
        captureDiagnostics.takePhotoHeight = height
        captureDiagnostics.captureMethod = 'takePhoto'
        captureDiagnostics.originalMimeType = blob.type
        captureDiagnostics.originalByteSize = blob.size
        return { blob, width, height, capturedAt: new Date().toISOString(), diagnostics: captureDiagnostics }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`takePhoto retry failed: ${msg}`)
        captureDiagnostics.takePhotoRetrySuccess = false
        captureDiagnostics.takePhotoRetryError = msg
        captureDiagnostics.errors = captureDiagnostics.errors || []
        captureDiagnostics.errors.push(`takePhoto retry: ${msg}`)
      }
    }

    // ── Step 4: grabFrame fallback ──
    if (typeof ImageCapture !== 'undefined') {
      try {
        const imageCapture = new ImageCapture(track)
        const bitmap = await imageCapture.grabFrame()
        const blob = await bitmapToBlob(bitmap)
        console.log(`grabFrame fallback: ${bitmap.width}x${bitmap.height}`)
        captureDiagnostics.captureMethod = 'grabFrame'
        captureDiagnostics.originalMimeType = blob.type
        captureDiagnostics.originalByteSize = blob.size
        return {
          blob,
          width: bitmap.width,
          height: bitmap.height,
          capturedAt: new Date().toISOString(),
          diagnostics: captureDiagnostics,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`grabFrame failed: ${msg}`)
        captureDiagnostics.errors = captureDiagnostics.errors || []
        captureDiagnostics.errors.push(`grabFrame: ${msg}`)
      }
    }

    // ── Step 5: Canvas fallback ──
    return captureFromTrackViaCanvas(track, captureDiagnostics)
  }

  getCapabilities(): CameraCapabilities | null {
    return this.capabilities
  }

  getActiveTrack(): MediaStreamTrack | null {
    return this.track
  }

  async listVideoInputDevices(): Promise<CameraDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return []
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({
        kind: device.kind,
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(0, 4)}`,
        groupId: device.groupId || '',
      }))
  }

  async applyTestConstraints(constraints: CameraTestConstraintSet): Promise<CameraCapabilities | null> {
    const track = this.track
    if (!track) {
      throw new Error('Camera not started')
    }

    const { width: _width, height: _height, ...safeConstraints } = constraints as CameraTestConstraintSet & {
      width?: unknown
      height?: unknown
    }

    await track.applyConstraints({
      advanced: [safeConstraints] as MediaTrackConstraintSet[],
    })

    this.capabilities = probeCapabilities(track, this.videoEl ?? undefined)
    return this.capabilities
  }

  private async applyBestEffortPreviewQualityUpgrade(track: MediaStreamTrack): Promise<void> {
    const requestedAdvanced = buildBestEffortPreviewQualityConstraints(track)
    this.diagnostics.previewQualityAttempted = true
    this.diagnostics.previewQualityRequestedConstraints = requestedAdvanced.map((entry) => JSON.stringify(entry))
    console.log(`Preview quality request: ${this.diagnostics.previewQualityRequestedConstraints.join(' | ')}`)

    try {
      await track.applyConstraints({
        advanced: requestedAdvanced as MediaTrackConstraintSet[],
      })
      await new Promise((resolve) => setTimeout(resolve, 120))
      this.diagnostics.previewQualityApplied = true
      this.diagnostics.previewQualityTrackSettings = readTrackSettings(track)
      console.log(
        `Preview quality applied: ${this.diagnostics.previewQualityTrackSettings.width ?? '?'}x${this.diagnostics.previewQualityTrackSettings.height ?? '?'}` +
          ` @ ${this.diagnostics.previewQualityTrackSettings.frameRate ?? '?'}fps`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.diagnostics.previewQualityApplied = false
      this.diagnostics.previewQualityError = msg
      console.warn(`Preview quality request failed: ${msg}`)
    }
  }

  async switchDevice(deviceId: string): Promise<CameraCapabilities | null> {
    const videoEl = this.videoEl
    if (!videoEl) {
      throw new Error('Camera view not attached')
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API unavailable')
    }

    const currentDeviceId = this.track?.getSettings().deviceId
    if (currentDeviceId && currentDeviceId === deviceId) {
      return this.capabilities
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    })

    const previousStream = this.stream
    this.stream = stream
    this.track = stream.getVideoTracks()[0] || null
    videoEl.srcObject = stream
    await videoEl.play()

    if (previousStream) {
      previousStream.getTracks().forEach((t) => t.stop())
    }

    this.capabilities = this.track ? probeCapabilities(this.track, videoEl) : null
    return this.capabilities
  }
}

function probeCapabilities(track: MediaStreamTrack, videoEl?: HTMLVideoElement): CameraCapabilities {
  let raw: MediaTrackCapabilities | null = null
  let zoomSupported = false
  let torchSupported = false
  let focusModes: string[] = []
  const facingModes: string[] = []
  const deviceLabels: string[] = []

  try {
    raw = track.getCapabilities()
    zoomSupported = 'zoom' in raw
    torchSupported = 'torch' in raw
    focusModes = (raw as MediaTrackCapabilities & { focusMode?: string[] }).focusMode ?? []
    const fm = (raw as MediaTrackCapabilities & { facingMode?: string[] }).facingMode
    if (fm) facingModes.push(...fm)
  } catch {
    // getCapabilities not supported on this browser
  }

  deviceLabels.push(track.label)

  let trackSettings: TrackSettings | null = null
  try {
    const s = track.getSettings()
    const ext = s as typeof s & {
      zoom?: number
      torch?: boolean
      focusMode?: string
      focusDistance?: number
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
    trackSettings = {
      width: s.width,
      height: s.height,
      aspectRatio: s.aspectRatio,
      facingMode: s.facingMode,
      deviceId: s.deviceId,
      zoom: ext.zoom,
      torch: ext.torch,
      focusMode: ext.focusMode,
      focusDistance: ext.focusDistance,
      exposureMode: ext.exposureMode,
      exposureTime: ext.exposureTime,
      exposureCompensation: ext.exposureCompensation,
      whiteBalanceMode: ext.whiteBalanceMode,
      brightness: ext.brightness,
      contrast: ext.contrast,
      saturation: ext.saturation,
      sharpness: ext.sharpness,
      iso: ext.iso,
      frameRate: s.frameRate,
    }
    if (videoEl) {
      trackSettings.width = trackSettings.width ?? (videoEl.videoWidth || undefined)
      trackSettings.height = trackSettings.height ?? (videoEl.videoHeight || undefined)
    }
  } catch {
    // getSettings not supported
  }

  return {
    zoom: zoomSupported,
    torch: torchSupported,
    focusMode: focusModes,
    facingModes,
    deviceLabels,
    raw,
    trackSettings,
  }
}

function readTrackSettings(track: MediaStreamTrack): TrackSettings {
  try {
    const s = track.getSettings()
    const ext = s as typeof s & {
      zoom?: number
      torch?: boolean
      focusMode?: string
      focusDistance?: number
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
    return {
      width: s.width,
      height: s.height,
      aspectRatio: s.aspectRatio,
      facingMode: s.facingMode,
      deviceId: s.deviceId,
      zoom: ext.zoom,
      torch: ext.torch,
      focusMode: ext.focusMode,
      focusDistance: ext.focusDistance,
      exposureMode: ext.exposureMode,
      exposureTime: ext.exposureTime,
      exposureCompensation: ext.exposureCompensation,
      whiteBalanceMode: ext.whiteBalanceMode,
      brightness: ext.brightness,
      contrast: ext.contrast,
      saturation: ext.saturation,
      sharpness: ext.sharpness,
      iso: ext.iso,
      frameRate: s.frameRate,
    }
  } catch {
    return {
      width: undefined,
      height: undefined,
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
    }
  }
}

function buildBestEffortPreviewQualityConstraints(track: MediaStreamTrack): Array<Record<string, unknown>> {
  let rawCaps: (MediaTrackCapabilities & { width?: { max?: number }; height?: { max?: number } }) | null = null
  try {
    rawCaps = track.getCapabilities() as MediaTrackCapabilities & { width?: { max?: number }; height?: { max?: number } }
  } catch {
    rawCaps = null
  }

  const widthMax = rawCaps?.width?.max
  const heightMax = rawCaps?.height?.max
  const idealWidth = widthMax && widthMax >= 1920 ? widthMax : 4032
  const idealHeight = heightMax && heightMax >= 1440 ? heightMax : 3024

  return [
    {
      width: { ideal: idealWidth },
      height: { ideal: idealHeight },
      frameRate: { ideal: 60, max: 60 },
      aspectRatio: { ideal: 4 / 3 },
    },
    {
      width: { ideal: 1920 },
      height: { ideal: 1440 },
      frameRate: { ideal: 30, max: 60 },
    },
    {
      width: { ideal: 1280 },
      height: { ideal: 960 },
      frameRate: { ideal: 30, max: 60 },
    },
  ]
}

// Shutter-time high-res track upgrade.
// Attempts to push the track to maximum available resolution using ideal constraints.
// Returns list of candidates attempted. Mutates track in place.
async function attemptHighResUpgrade(
  track: MediaStreamTrack,
  diagnostics: CaptureDiagnostics,
): Promise<void> {
  diagnostics.highResUpgradeAttempted = true
  const attempted: string[] = []

  let rawCaps: (MediaTrackCapabilities & { width?: { max?: number }; height?: { max?: number } }) | null = null
  try {
    rawCaps = track.getCapabilities() as MediaTrackCapabilities & { width?: { max?: number }; height?: { max?: number } }
  } catch {
    rawCaps = null
  }

  const capsMaxW = rawCaps?.width?.max
  const capsMaxH = rawCaps?.height?.max

  // Build candidates from capabilities + known iPhone high-res targets
  // Use ideal (not exact) to avoid hard failures on borderline hardware
  const candidates: Array<{ width: number; height: number; name: string }> = []
  if (capsMaxW && capsMaxH) {
    candidates.push({ width: capsMaxW, height: capsMaxH, name: `caps-${capsMaxW}x${capsMaxH}` })
    if (capsMaxW !== capsMaxH) {
      candidates.push({ width: capsMaxH, height: capsMaxW, name: `caps-swapped-${capsMaxH}x${capsMaxW}` })
    }
  }
  // Known iPhone high-res stills candidates
  candidates.push({ width: 3024, height: 4032, name: '3024x4032-portrait' })
  candidates.push({ width: 4032, height: 3024, name: '4032x3024-landscape' })
  candidates.push({ width: 1920, height: 1440, name: '1920x1440-4:3' })
  candidates.push({ width: 1440, height: 1920, name: '1440x1920-portrait' })

  let bestPixels = (readTrackSettings(track).width ?? 0) * (readTrackSettings(track).height ?? 0)

  for (const c of candidates) {
    attempted.push(c.name)
    try {
      await track.applyConstraints({
        advanced: [{ width: { ideal: c.width }, height: { ideal: c.height } }] as MediaTrackConstraintSet[],
      })
      // Brief settle time
      await new Promise<void>((resolve) => setTimeout(resolve, 120))
      const s = readTrackSettings(track)
      const pixels = (s.width ?? 0) * (s.height ?? 0)
      console.log(`highResUpgrade candidate ${c.name}: settings after = ${s.width}x${s.height} (${pixels}px)`)
      if (pixels > bestPixels) {
        bestPixels = pixels
        // Good enough if either axis is above target
        if ((s.width ?? 0) >= 1200 && (s.height ?? 0) >= 1200) break
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`highResUpgrade candidate ${c.name} failed: ${msg}`)
    }
  }

  diagnostics.highResConstraintCandidatesAttempted = attempted
  diagnostics.postUpgradeTrackSettings = readTrackSettings(track)
  console.log(`highResUpgrade done: track now ${diagnostics.postUpgradeTrackSettings.width}x${diagnostics.postUpgradeTrackSettings.height}`)
}

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

async function captureFromTrackViaCanvas(track: MediaStreamTrack, diagnostics?: CaptureDiagnostics): Promise<CapturedFrame> {
  const settings = track.getSettings()
  // Use actual stream dimensions without arbitrary fallback caps
  const width = settings.width ?? undefined
  const height = settings.height ?? undefined

  if (!width || !height) {
    throw new Error('Unable to determine stream dimensions for canvas fallback')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context for canvas fallback')

  const tempVideo = document.createElement('video')
  tempVideo.srcObject = new MediaStream([track])
  await tempVideo.play()

  ctx.drawImage(tempVideo, 0, 0, width, height)
  tempVideo.pause()
  tempVideo.srcObject = null

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('Canvas toBlob returned null'))
      },
      'image/jpeg',
      0.92,
    )
  })

  console.log(`Canvas fallback captured: ${width}x${height}`)
  if (diagnostics) {
    diagnostics.captureMethod = 'canvas'
    diagnostics.originalMimeType = blob.type
    diagnostics.originalByteSize = blob.size
  }
  return { blob, width, height, capturedAt: new Date().toISOString(), diagnostics }
}
