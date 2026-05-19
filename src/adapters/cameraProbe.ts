// Camera capability probe — diagnostics only.
// Run only from the camera test drawer; never called during normal capture.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConstraintProbeResult {
  constraint: string
  attempted: boolean
  success: boolean
  errorName: string | null
  errorMessage: string | null
  settingsBefore: Record<string, unknown>
  settingsAfter: Record<string, unknown>
  settingChanged: boolean
  skippedReason: string | null
  note: string | null
}

export interface ImageCaptureProbeResult {
  apiPresent: boolean
  constructorSuccess: boolean
  constructorError: string | null
  getPhotoCapabilitiesPresent: boolean
  getPhotoCapabilitiesResult: Record<string, unknown> | null
  getPhotoCapabilitiesError: string | null
  getPhotoSettingsPresent: boolean
  getPhotoSettingsResult: Record<string, unknown> | null
  getPhotoSettingsError: string | null
  grabFramePresent: boolean
  takePhotoPresent: boolean
}

export interface CameraProbeResult {
  timestamp: string
  userAgent: string
  standaloneMode: boolean | null
  displayMode: string | null
  isSecureContext: boolean
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
  getSupportedConstraints: Record<string, boolean>
  enumeratedDevices: Array<{ kind: string; label: string; deviceId: string; groupId: string }>
  enumeratedDevicesError: string | null
  trackPresent: boolean
  trackReadyState: string | null
  trackMuted: boolean | null
  trackEnabled: boolean | null
  trackLabel: string | null
  trackCapabilities: Record<string, unknown> | null
  trackCapabilitiesError: string | null
  trackSettings: Record<string, unknown> | null
  trackSettingsError: string | null
  trackConstraints: Record<string, unknown> | null
  trackConstraintsError: string | null
  imageCaptureProbe: ImageCaptureProbeResult
  constraintProbes: ConstraintProbeResult[]
}

// ---------------------------------------------------------------------------
// Pure formatting helpers (testable without browser APIs)
// ---------------------------------------------------------------------------

export function formatProbeReport(result: CameraProbeResult): string {
  const lines: string[] = []

  lines.push('=== CAMERA CAPABILITY PROBE ===')
  lines.push(`Timestamp: ${result.timestamp}`)
  lines.push(`UA: ${result.userAgent}`)
  lines.push(`Standalone/PWA: ${result.standaloneMode === null ? 'unknown' : result.standaloneMode}`)
  lines.push(`Display mode: ${result.displayMode ?? 'unknown'}`)
  lines.push(`Secure context: ${result.isSecureContext}`)
  lines.push(`Viewport: ${result.viewportWidth}x${result.viewportHeight} @ ${result.devicePixelRatio}x`)
  lines.push('')

  lines.push('--- Track state ---')
  if (!result.trackPresent) {
    lines.push('No active track (camera not started or already stopped)')
  } else {
    lines.push(`readyState: ${result.trackReadyState ?? 'unknown'}`)
    lines.push(`muted: ${result.trackMuted ?? 'unknown'}`)
    lines.push(`enabled: ${result.trackEnabled ?? 'unknown'}`)
    lines.push(`label: ${result.trackLabel ?? 'unknown'}`)
  }
  lines.push('')

  lines.push('--- getSupportedConstraints ---')
  const supported = Object.entries(result.getSupportedConstraints)
    .filter(([, v]) => v)
    .map(([k]) => k)
  lines.push(supported.length > 0 ? supported.join(', ') : '(none reported)')
  lines.push('')

  lines.push('--- Enumerated devices ---')
  if (result.enumeratedDevicesError) {
    lines.push(`Error: ${result.enumeratedDevicesError}`)
  } else {
    for (const d of result.enumeratedDevices) {
      lines.push(`  [${d.kind}] ${d.label || '(no label)'} id=${d.deviceId.slice(0, 8)}…`)
    }
    if (result.enumeratedDevices.length === 0) lines.push('(none returned)')
  }
  lines.push('')

  lines.push('--- Track capabilities ---')
  if (result.trackCapabilitiesError) {
    lines.push(`Error: ${result.trackCapabilitiesError}`)
  } else if (result.trackCapabilities) {
    lines.push(JSON.stringify(result.trackCapabilities, null, 2))
  } else {
    lines.push('(not available)')
  }
  lines.push('')

  lines.push('--- Track settings ---')
  if (result.trackSettingsError) {
    lines.push(`Error: ${result.trackSettingsError}`)
  } else if (result.trackSettings) {
    lines.push(JSON.stringify(result.trackSettings, null, 2))
  } else {
    lines.push('(not available)')
  }
  lines.push('')

  lines.push('--- Track constraints ---')
  if (result.trackConstraintsError) {
    lines.push(`Error: ${result.trackConstraintsError}`)
  } else if (result.trackConstraints) {
    lines.push(JSON.stringify(result.trackConstraints, null, 2))
  } else {
    lines.push('(not available)')
  }
  lines.push('')

  lines.push('--- ImageCapture probe ---')
  const ic = result.imageCaptureProbe
  lines.push(`API present: ${ic.apiPresent}`)
  lines.push(`Constructor success: ${ic.constructorSuccess}${ic.constructorError ? ` (${ic.constructorError})` : ''}`)
  if (ic.constructorSuccess) {
    lines.push(`getPhotoCapabilities present: ${ic.getPhotoCapabilitiesPresent}`)
    if (ic.getPhotoCapabilitiesResult) lines.push(`  result: ${JSON.stringify(ic.getPhotoCapabilitiesResult)}`)
    if (ic.getPhotoCapabilitiesError) lines.push(`  error: ${ic.getPhotoCapabilitiesError}`)
    lines.push(`getPhotoSettings present: ${ic.getPhotoSettingsPresent}`)
    if (ic.getPhotoSettingsResult) lines.push(`  result: ${JSON.stringify(ic.getPhotoSettingsResult)}`)
    if (ic.getPhotoSettingsError) lines.push(`  error: ${ic.getPhotoSettingsError}`)
    lines.push(`grabFrame present: ${ic.grabFramePresent}`)
    lines.push(`takePhoto present: ${ic.takePhotoPresent}`)
  }
  lines.push('')

  lines.push('--- applyConstraints probes ---')
  if (result.constraintProbes.length === 0) {
    lines.push('(no probes run — capabilities not exposed)')
  }
  for (const p of result.constraintProbes) {
    let status: string
    if (!p.attempted) {
      status = `SKIPPED${p.skippedReason ? ` — ${p.skippedReason}` : ''}`
    } else if (p.success) {
      status = p.settingChanged ? 'OK (reflected in settings)' : 'OK (accepted; not reflected in getSettings)'
    } else {
      status = `FAILED: ${p.errorName ?? ''} ${p.errorMessage ?? ''}`
    }
    const noteLine = p.note ? ` [${p.note}]` : ''
    lines.push(`  ${p.constraint}: ${status}${noteLine}`)
  }
  lines.push('')

  lines.push('--- Manual observations (fill in after running on iPhone) ---')
  lines.push('  Did torch visibly turn on?         [ ]')
  lines.push('  Did lens visibly switch?            [ ]')
  lines.push('  Did preview go black?               [ ]')
  lines.push('  Did preview recover after closing?  [ ]')
  lines.push('  Did captured output look sharp?     [ ]')
  lines.push('')
  lines.push('=== END PROBE ===')

  return lines.join('\n')
}

export function summarizeProbeForLog(result: CameraProbeResult): string {
  const caps = result.trackCapabilities
  const capKeys = caps ? Object.keys(caps) : []
  const probeResults = result.constraintProbes
    .map((p) => {
      if (!p.attempted) return `${p.constraint}:skip`
      if (!p.success) return `${p.constraint}:fail`
      return `${p.constraint}:${p.settingChanged ? 'ok/changed' : 'ok/not-reflected'}`
    })
    .join(' ')

  return [
    `track=${result.trackPresent ? result.trackReadyState ?? 'present' : 'absent'}`,
    `caps=[${capKeys.join(',')}]`,
    `imageCapture=${result.imageCaptureProbe.apiPresent ? (result.imageCaptureProbe.constructorSuccess ? 'ok' : 'no-ctor') : 'absent'}`,
    `probes=[${probeResults || 'none'}]`,
  ].join(' | ')
}

// ---------------------------------------------------------------------------
// Probe runner
// ---------------------------------------------------------------------------

interface ImageCaptureWithExtras extends EventTarget {
  grabFrame(): Promise<ImageBitmap>
  takePhoto(): Promise<Blob>
  getPhotoCapabilities?(): Promise<Record<string, unknown>>
  getPhotoSettings?(): Promise<Record<string, unknown>>
}

declare const ImageCapture: {
  new(track: MediaStreamTrack): ImageCaptureWithExtras
} | undefined

function safeGetSettings(track: MediaStreamTrack): [Record<string, unknown> | null, string | null] {
  try {
    return [track.getSettings() as Record<string, unknown>, null]
  } catch (e) {
    return [null, e instanceof Error ? e.message : String(e)]
  }
}

export function skippedProbeEntry(label: string, reason: string, note?: string): ConstraintProbeResult {
  return {
    constraint: label,
    attempted: false,
    success: false,
    errorName: null,
    errorMessage: null,
    settingsBefore: {},
    settingsAfter: {},
    settingChanged: false,
    skippedReason: reason,
    note: note ?? null,
  }
}

async function probeConstraint(
  track: MediaStreamTrack,
  constraint: MediaTrackConstraintSet,
  label: string,
  note?: string,
): Promise<ConstraintProbeResult> {
  const [before] = safeGetSettings(track)
  const settingsBefore = before ?? {}

  try {
    await track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] })
    const [after] = safeGetSettings(track)
    const settingsAfter = after ?? {}

    const constraintKeys = Object.keys(constraint)
    const settingChanged = constraintKeys.some((k) => settingsBefore[k] !== settingsAfter[k])

    return {
      constraint: label,
      attempted: true,
      success: true,
      errorName: null,
      errorMessage: null,
      settingsBefore,
      settingsAfter,
      settingChanged,
      skippedReason: null,
      note: note ?? null,
    }
  } catch (e) {
    return {
      constraint: label,
      attempted: true,
      success: false,
      errorName: e instanceof Error ? e.name : null,
      errorMessage: e instanceof Error ? e.message : String(e),
      settingsBefore,
      settingsAfter: settingsBefore,
      settingChanged: false,
      skippedReason: null,
      note: note ?? null,
    }
  }
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step: number }
  torch?: boolean
  focusMode?: string[]
  focusDistance?: { min: number; max: number; step: number }
  exposureMode?: string[]
  exposureCompensation?: { min: number; max: number; step: number }
  whiteBalanceMode?: string[]
  colorTemperature?: { min: number; max: number; step: number }
  width?: { min: number; max: number; step: number }
  height?: { min: number; max: number; step: number }
  frameRate?: { min: number; max: number; step: number }
}

type ExtendedConstraints = MediaTrackConstraintSet & {
  zoom?: number | object
  torch?: boolean
  focusMode?: string | string[] | object
  focusDistance?: number | object
  exposureMode?: string | string[] | object
  exposureCompensation?: number | object
  whiteBalanceMode?: string | string[] | object
}

async function buildConstraintProbes(
  track: MediaStreamTrack,
  caps: ExtendedCapabilities,
): Promise<ConstraintProbeResult[]> {
  const probes: ConstraintProbeResult[] = []

  // Snapshot settings before all mutating probes so we can restore afterwards.
  const [preProbeSettings] = safeGetSettings(track)
  const originalZoom = typeof preProbeSettings?.zoom === 'number' ? preProbeSettings.zoom : null
  const originalFrameRate = typeof preProbeSettings?.frameRate === 'number' ? preProbeSettings.frameRate : null
  const originalWhiteBalance = typeof preProbeSettings?.whiteBalanceMode === 'string' ? preProbeSettings.whiteBalanceMode : null

  if (caps.zoom) {
    const { min, max } = caps.zoom
    const mid = min + (max - min) / 2
    probes.push(await probeConstraint(track, { zoom: min } as ExtendedConstraints, `zoom=${min}`))
    probes.push(await probeConstraint(track, { zoom: mid } as ExtendedConstraints, `zoom=${mid.toFixed(2)}`))
    probes.push(await probeConstraint(track, { zoom: max } as ExtendedConstraints, `zoom=${max}`))
    // Restore zoom to original value
    const restoreZoom = originalZoom !== null ? originalZoom : min
    probes.push(await probeConstraint(track, { zoom: restoreZoom } as ExtendedConstraints, `zoom=${restoreZoom}(restore)`))
  }

  if (caps.torch) {
    probes.push(await probeConstraint(track, { torch: true } as ExtendedConstraints, 'torch=true'))
    probes.push(await probeConstraint(track, { torch: false } as ExtendedConstraints, 'torch=false(restore)'))
  }

  if (caps.focusMode && caps.focusMode.length > 0) {
    for (const mode of caps.focusMode) {
      probes.push(await probeConstraint(track, { focusMode: mode } as ExtendedConstraints, `focusMode=${mode}`))
    }
  }

  if (caps.focusDistance) {
    const { min, max } = caps.focusDistance
    if (isFinite(min) && isFinite(max) && max > min) {
      const mid = min + (max - min) / 2
      probes.push(await probeConstraint(
        track,
        { focusDistance: mid } as ExtendedConstraints,
        `focusDistance=${mid.toFixed(3)}`,
        'accepted previously but not reflected in getSettings; not proven effective',
      ))
      probes.push(await probeConstraint(
        track,
        { focusDistance: min } as ExtendedConstraints,
        `focusDistance=${min}(restore)`,
      ))
    } else {
      const reason = !isFinite(max)
        ? 'focusDistance exposed but not probeable: missing or non-finite max'
        : 'focusDistance exposed but not probeable: max <= min'
      probes.push(skippedProbeEntry(
        `focusDistance(min=${isFinite(min) ? min : '?'})`,
        reason,
        'accepted previously but not reflected in getSettings; not proven effective',
      ))
    }
  }

  if (caps.exposureMode && caps.exposureMode.length > 0) {
    for (const mode of caps.exposureMode) {
      probes.push(await probeConstraint(track, { exposureMode: mode } as ExtendedConstraints, `exposureMode=${mode}`))
    }
  }

  if (caps.exposureCompensation) {
    const { min, max } = caps.exposureCompensation
    const mid = min + (max - min) / 2
    probes.push(await probeConstraint(track, { exposureCompensation: mid } as ExtendedConstraints, `exposureCompensation=${mid.toFixed(2)}`))
    probes.push(await probeConstraint(track, { exposureCompensation: 0 } as ExtendedConstraints, 'exposureCompensation=0(restore)'))
  }

  if (caps.whiteBalanceMode && caps.whiteBalanceMode.length > 0) {
    for (const mode of caps.whiteBalanceMode) {
      probes.push(await probeConstraint(track, { whiteBalanceMode: mode } as ExtendedConstraints, `whiteBalanceMode=${mode}`))
    }
    // Restore original whiteBalanceMode if we changed it
    if (originalWhiteBalance !== null && caps.whiteBalanceMode.includes(originalWhiteBalance)) {
      probes.push(await probeConstraint(
        track,
        { whiteBalanceMode: originalWhiteBalance } as ExtendedConstraints,
        `whiteBalanceMode=${originalWhiteBalance}(restore)`,
      ))
    }
  }

  // Size probe is skipped by default — applying lower resolution can degrade the active
  // capture stream and is not reliably restorable via applyConstraints alone.
  if (caps.width && caps.height) {
    probes.push(skippedProbeEntry(
      `size(max=${caps.width.max}x${caps.height.max})`,
      'skipped for safety — applying a lower resolution can reduce capture quality and may not restore reliably',
      'supported but can reduce capture settings; run manually if needed',
    ))
  }

  if (caps.frameRate) {
    // Probe 60fps only if the device declares it supported
    if (caps.frameRate.max >= 60) {
      probes.push(await probeConstraint(track, { frameRate: 60 } as ExtendedConstraints, 'frameRate=60'))
    } else {
      const safeRate = Math.min(caps.frameRate.max, 30)
      probes.push(await probeConstraint(track, { frameRate: safeRate } as ExtendedConstraints, `frameRate=${safeRate}`))
    }
    // Restore original frameRate
    if (originalFrameRate !== null) {
      probes.push(await probeConstraint(
        track,
        { frameRate: originalFrameRate } as ExtendedConstraints,
        `frameRate=${originalFrameRate}(restore)`,
      ))
    }
  }

  return probes
}

async function probeImageCapture(track: MediaStreamTrack): Promise<ImageCaptureProbeResult> {
  const result: ImageCaptureProbeResult = {
    apiPresent: typeof ImageCapture !== 'undefined',
    constructorSuccess: false,
    constructorError: null,
    getPhotoCapabilitiesPresent: false,
    getPhotoCapabilitiesResult: null,
    getPhotoCapabilitiesError: null,
    getPhotoSettingsPresent: false,
    getPhotoSettingsResult: null,
    getPhotoSettingsError: null,
    grabFramePresent: false,
    takePhotoPresent: false,
  }

  if (!result.apiPresent) return result

  let ic: ImageCaptureWithExtras | null = null
  try {
    ic = new ImageCapture!(track)
    result.constructorSuccess = true
  } catch (e) {
    result.constructorError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    return result
  }

  result.grabFramePresent = typeof ic.grabFrame === 'function'
  result.takePhotoPresent = typeof ic.takePhoto === 'function'
  result.getPhotoCapabilitiesPresent = typeof ic.getPhotoCapabilities === 'function'
  result.getPhotoSettingsPresent = typeof ic.getPhotoSettings === 'function'

  if (result.getPhotoCapabilitiesPresent && ic.getPhotoCapabilities) {
    try {
      result.getPhotoCapabilitiesResult = await ic.getPhotoCapabilities()
    } catch (e) {
      result.getPhotoCapabilitiesError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }

  if (result.getPhotoSettingsPresent && ic.getPhotoSettings) {
    try {
      result.getPhotoSettingsResult = await ic.getPhotoSettings()
    } catch (e) {
      result.getPhotoSettingsError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }

  return result
}

export async function runCameraProbe(track: MediaStreamTrack | null): Promise<CameraProbeResult> {
  const timestamp = new Date().toISOString()
  const userAgent = navigator.userAgent

  const standaloneMode: boolean | null =
    'standalone' in navigator
      ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
      : null

  const displayMode: string | null = (() => {
    if (!window.matchMedia) return null
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
    if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen'
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui'
    return 'browser'
  })()

  const isSecureContext = window.isSecureContext
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const devicePixelRatio = window.devicePixelRatio ?? 1

  const getSupportedConstraints: Record<string, boolean> = {}
  try {
    const raw = navigator.mediaDevices?.getSupportedConstraints?.() ?? {}
    for (const [k, v] of Object.entries(raw)) {
      getSupportedConstraints[k] = Boolean(v)
    }
  } catch { /* not available */ }

  let enumeratedDevices: CameraProbeResult['enumeratedDevices'] = []
  let enumeratedDevicesError: string | null = null
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.() ?? []
    enumeratedDevices = devices.map((d) => ({
      kind: d.kind,
      label: d.label,
      deviceId: d.deviceId,
      groupId: d.groupId,
    }))
  } catch (e) {
    enumeratedDevicesError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  }

  const trackPresent = track !== null && track.readyState === 'live'

  let trackReadyState: string | null = null
  let trackMuted: boolean | null = null
  let trackEnabled: boolean | null = null
  let trackLabel: string | null = null
  let trackCapabilities: Record<string, unknown> | null = null
  let trackCapabilitiesError: string | null = null
  let trackSettings: Record<string, unknown> | null = null
  let trackSettingsError: string | null = null
  let trackConstraints: Record<string, unknown> | null = null
  let trackConstraintsError: string | null = null

  if (track) {
    trackReadyState = track.readyState
    trackMuted = track.muted
    trackEnabled = track.enabled
    trackLabel = track.label

    try {
      trackCapabilities = track.getCapabilities() as Record<string, unknown>
    } catch (e) {
      trackCapabilitiesError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }

    try {
      trackSettings = track.getSettings() as Record<string, unknown>
    } catch (e) {
      trackSettingsError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }

    try {
      trackConstraints = track.getConstraints() as Record<string, unknown>
    } catch (e) {
      trackConstraintsError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    }
  }

  const imageCaptureProbe = track ? await probeImageCapture(track) : {
    apiPresent: typeof ImageCapture !== 'undefined',
    constructorSuccess: false,
    constructorError: 'No active track',
    getPhotoCapabilitiesPresent: false,
    getPhotoCapabilitiesResult: null,
    getPhotoCapabilitiesError: null,
    getPhotoSettingsPresent: false,
    getPhotoSettingsResult: null,
    getPhotoSettingsError: null,
    grabFramePresent: false,
    takePhotoPresent: false,
  }

  const constraintProbes: ConstraintProbeResult[] = []
  if (track && track.readyState === 'live' && trackCapabilities) {
    const caps = trackCapabilities as ExtendedCapabilities
    try {
      const probes = await buildConstraintProbes(track, caps)
      constraintProbes.push(...probes)
    } catch { /* constraint probing failed — not fatal */ }
  }

  return {
    timestamp,
    userAgent,
    standaloneMode,
    displayMode,
    isSecureContext,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    getSupportedConstraints,
    enumeratedDevices,
    enumeratedDevicesError,
    trackPresent,
    trackReadyState,
    trackMuted,
    trackEnabled,
    trackLabel,
    trackCapabilities,
    trackCapabilitiesError,
    trackSettings,
    trackSettingsError,
    trackConstraints,
    trackConstraintsError,
    imageCaptureProbe,
    constraintProbes,
  }
}

