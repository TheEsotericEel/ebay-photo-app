import { describe, expect, it } from 'vitest'
import {
  formatProbeReport,
  summarizeProbeForLog,
  type CameraProbeResult,
  type ConstraintProbeResult,
} from './cameraProbe'

// ---------------------------------------------------------------------------
// Minimal builder helpers
// ---------------------------------------------------------------------------

function minimalProbeResult(overrides: Partial<CameraProbeResult> = {}): CameraProbeResult {
  return {
    timestamp: '2026-05-18T17:00:00.000Z',
    userAgent: 'TestUA/1.0',
    standaloneMode: null,
    displayMode: 'browser',
    isSecureContext: true,
    viewportWidth: 390,
    viewportHeight: 844,
    devicePixelRatio: 3,
    getSupportedConstraints: {},
    enumeratedDevices: [],
    enumeratedDevicesError: null,
    trackPresent: false,
    trackReadyState: null,
    trackMuted: null,
    trackEnabled: null,
    trackLabel: null,
    trackCapabilities: null,
    trackCapabilitiesError: null,
    trackSettings: null,
    trackSettingsError: null,
    trackConstraints: null,
    trackConstraintsError: null,
    imageCaptureProbe: {
      apiPresent: false,
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
    },
    constraintProbes: [],
    ...overrides,
  }
}

function successProbe(constraint: string): ConstraintProbeResult {
  return {
    constraint,
    attempted: true,
    success: true,
    errorName: null,
    errorMessage: null,
    settingsBefore: { zoom: 1 },
    settingsAfter: { zoom: 2 },
    settingChanged: true,
  }
}

function failedProbe(constraint: string): ConstraintProbeResult {
  return {
    constraint,
    attempted: true,
    success: false,
    errorName: 'NotSupportedError',
    errorMessage: 'constraint not supported',
    settingsBefore: { zoom: 1 },
    settingsAfter: { zoom: 1 },
    settingChanged: false,
  }
}

function skippedProbe(constraint: string): ConstraintProbeResult {
  return {
    constraint,
    attempted: false,
    success: false,
    errorName: null,
    errorMessage: null,
    settingsBefore: {},
    settingsAfter: {},
    settingChanged: false,
  }
}

// ---------------------------------------------------------------------------
// formatProbeReport — structure tests
// ---------------------------------------------------------------------------

describe('formatProbeReport', () => {
  it('includes the PROBE header and footer', () => {
    const report = formatProbeReport(minimalProbeResult())
    expect(report).toContain('=== CAMERA CAPABILITY PROBE ===')
    expect(report).toContain('=== END PROBE ===')
  })

  it('includes the provided timestamp verbatim', () => {
    const result = minimalProbeResult({ timestamp: '2026-01-01T00:00:00.000Z' })
    expect(formatProbeReport(result)).toContain('Timestamp: 2026-01-01T00:00:00.000Z')
  })

  it('includes userAgent', () => {
    const result = minimalProbeResult({ userAgent: 'Mozilla/5.0 Safari iPhone' })
    expect(formatProbeReport(result)).toContain('UA: Mozilla/5.0 Safari iPhone')
  })

  it('shows standaloneMode as true when set', () => {
    const result = minimalProbeResult({ standaloneMode: true })
    expect(formatProbeReport(result)).toContain('Standalone/PWA: true')
  })

  it('shows standaloneMode as false when set', () => {
    const result = minimalProbeResult({ standaloneMode: false })
    expect(formatProbeReport(result)).toContain('Standalone/PWA: false')
  })

  it('shows standaloneMode as unknown when null', () => {
    const result = minimalProbeResult({ standaloneMode: null })
    expect(formatProbeReport(result)).toContain('Standalone/PWA: unknown')
  })

  it('shows displayMode', () => {
    const result = minimalProbeResult({ displayMode: 'standalone' })
    expect(formatProbeReport(result)).toContain('Display mode: standalone')
  })

  it('shows secure context status', () => {
    const result = minimalProbeResult({ isSecureContext: false })
    expect(formatProbeReport(result)).toContain('Secure context: false')
  })

  it('shows viewport dimensions and pixel ratio', () => {
    const result = minimalProbeResult({ viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3 })
    expect(formatProbeReport(result)).toContain('Viewport: 390x844 @ 3x')
  })

  it('shows "No active track" message when trackPresent is false', () => {
    const result = minimalProbeResult({ trackPresent: false })
    expect(formatProbeReport(result)).toContain('No active track')
  })

  it('shows track state fields when trackPresent is true', () => {
    const result = minimalProbeResult({
      trackPresent: true,
      trackReadyState: 'live',
      trackMuted: false,
      trackEnabled: true,
      trackLabel: 'Back Camera',
    })
    const report = formatProbeReport(result)
    expect(report).toContain('readyState: live')
    expect(report).toContain('muted: false')
    expect(report).toContain('enabled: true')
    expect(report).toContain('label: Back Camera')
  })

  it('shows supported constraints when present', () => {
    const result = minimalProbeResult({
      getSupportedConstraints: { zoom: true, torch: true, width: true },
    })
    const report = formatProbeReport(result)
    expect(report).toContain('zoom')
    expect(report).toContain('torch')
    expect(report).toContain('width')
  })

  it('shows "(none reported)" when getSupportedConstraints is empty', () => {
    const result = minimalProbeResult({ getSupportedConstraints: {} })
    expect(formatProbeReport(result)).toContain('(none reported)')
  })

  it('shows enumerated device labels', () => {
    const result = minimalProbeResult({
      enumeratedDevices: [
        { kind: 'videoinput', label: 'Back Camera', deviceId: 'abc123', groupId: '' },
      ],
    })
    expect(formatProbeReport(result)).toContain('Back Camera')
  })

  it('shows enumeration error when present', () => {
    const result = minimalProbeResult({ enumeratedDevicesError: 'NotAllowedError: permission denied' })
    expect(formatProbeReport(result)).toContain('NotAllowedError: permission denied')
  })

  it('shows "(none returned)" when enumeratedDevices is empty', () => {
    const result = minimalProbeResult({ enumeratedDevices: [], enumeratedDevicesError: null })
    expect(formatProbeReport(result)).toContain('(none returned)')
  })

  it('shows track capabilities JSON when present', () => {
    const result = minimalProbeResult({
      trackCapabilities: { zoom: { min: 1, max: 4, step: 0.1 } },
    })
    expect(formatProbeReport(result)).toContain('"zoom"')
  })

  it('shows track capabilities error when present', () => {
    const result = minimalProbeResult({ trackCapabilitiesError: 'getCapabilities not supported' })
    expect(formatProbeReport(result)).toContain('getCapabilities not supported')
  })

  it('shows track settings JSON when present', () => {
    const result = minimalProbeResult({
      trackSettings: { width: 1280, height: 720 },
    })
    const report = formatProbeReport(result)
    expect(report).toContain('"width"')
    expect(report).toContain('1280')
  })

  it('shows track constraints JSON when present', () => {
    const result = minimalProbeResult({
      trackConstraints: { advanced: [{ zoom: 2 }] },
    })
    expect(formatProbeReport(result)).toContain('"advanced"')
  })

  it('shows ImageCapture as absent when apiPresent is false', () => {
    const result = minimalProbeResult()
    expect(formatProbeReport(result)).toContain('API present: false')
  })

  it('shows ImageCapture details when constructorSuccess is true', () => {
    const result = minimalProbeResult({
      imageCaptureProbe: {
        apiPresent: true,
        constructorSuccess: true,
        constructorError: null,
        getPhotoCapabilitiesPresent: true,
        getPhotoCapabilitiesResult: { fillLightMode: ['off', 'auto'] },
        getPhotoCapabilitiesError: null,
        getPhotoSettingsPresent: true,
        getPhotoSettingsResult: { fillLightMode: 'off' },
        getPhotoSettingsError: null,
        grabFramePresent: true,
        takePhotoPresent: true,
      },
    })
    const report = formatProbeReport(result)
    expect(report).toContain('API present: true')
    expect(report).toContain('Constructor success: true')
    expect(report).toContain('getPhotoCapabilities present: true')
    expect(report).toContain('grabFrame present: true')
    expect(report).toContain('takePhoto present: true')
    expect(report).toContain('fillLightMode')
  })

  it('shows ImageCapture constructor error when construction failed', () => {
    const result = minimalProbeResult({
      imageCaptureProbe: {
        apiPresent: true,
        constructorSuccess: false,
        constructorError: 'TypeError: failed to construct',
        getPhotoCapabilitiesPresent: false,
        getPhotoCapabilitiesResult: null,
        getPhotoCapabilitiesError: null,
        getPhotoSettingsPresent: false,
        getPhotoSettingsResult: null,
        getPhotoSettingsError: null,
        grabFramePresent: false,
        takePhotoPresent: false,
      },
    })
    expect(formatProbeReport(result)).toContain('TypeError: failed to construct')
  })

  it('shows "(no probes run)" when constraintProbes is empty', () => {
    const result = minimalProbeResult({ constraintProbes: [] })
    expect(formatProbeReport(result)).toContain('(no probes run')
  })

  it('shows OK for a successful probe where setting changed', () => {
    const result = minimalProbeResult({ constraintProbes: [successProbe('zoom=2')] })
    expect(formatProbeReport(result)).toContain('zoom=2: OK (CHANGED)')
  })

  it('shows FAILED for a failed probe with error details', () => {
    const result = minimalProbeResult({ constraintProbes: [failedProbe('torch=true')] })
    const report = formatProbeReport(result)
    expect(report).toContain('torch=true: FAILED: NotSupportedError constraint not supported')
  })

  it('shows SKIPPED for an unattempted probe', () => {
    const result = minimalProbeResult({ constraintProbes: [skippedProbe('focusMode=manual')] })
    expect(formatProbeReport(result)).toContain('focusMode=manual: SKIPPED')
  })

  it('includes all five manual observation fields', () => {
    const report = formatProbeReport(minimalProbeResult())
    expect(report).toContain('Did torch visibly turn on?')
    expect(report).toContain('Did lens visibly switch?')
    expect(report).toContain('Did preview go black?')
    expect(report).toContain('Did preview recover after closing?')
    expect(report).toContain('Did captured output look sharp?')
  })
})

// ---------------------------------------------------------------------------
// summarizeProbeForLog — one-liner log entry
// ---------------------------------------------------------------------------

describe('summarizeProbeForLog', () => {
  it('reports track=absent when trackPresent is false', () => {
    const result = minimalProbeResult({ trackPresent: false })
    expect(summarizeProbeForLog(result)).toContain('track=absent')
  })

  it('reports track readyState when present', () => {
    const result = minimalProbeResult({ trackPresent: true, trackReadyState: 'live' })
    expect(summarizeProbeForLog(result)).toContain('track=live')
  })

  it('reports capability keys when trackCapabilities are set', () => {
    const result = minimalProbeResult({
      trackCapabilities: { zoom: { min: 1, max: 4, step: 0.1 }, torch: true },
    })
    const summary = summarizeProbeForLog(result)
    expect(summary).toContain('zoom')
    expect(summary).toContain('torch')
  })

  it('reports empty caps when trackCapabilities is null', () => {
    const result = minimalProbeResult({ trackCapabilities: null })
    expect(summarizeProbeForLog(result)).toContain('caps=[]')
  })

  it('reports imageCapture=absent when api not present', () => {
    const result = minimalProbeResult()
    expect(summarizeProbeForLog(result)).toContain('imageCapture=absent')
  })

  it('reports imageCapture=ok when constructor succeeded', () => {
    const result = minimalProbeResult({
      imageCaptureProbe: { ...minimalProbeResult().imageCaptureProbe, apiPresent: true, constructorSuccess: true },
    })
    expect(summarizeProbeForLog(result)).toContain('imageCapture=ok')
  })

  it('reports imageCapture=no-ctor when api present but constructor failed', () => {
    const result = minimalProbeResult({
      imageCaptureProbe: {
        ...minimalProbeResult().imageCaptureProbe,
        apiPresent: true,
        constructorSuccess: false,
        constructorError: 'TypeError',
      },
    })
    expect(summarizeProbeForLog(result)).toContain('imageCapture=no-ctor')
  })

  it('reports probe results summary', () => {
    const result = minimalProbeResult({
      constraintProbes: [
        successProbe('zoom=2'),
        failedProbe('torch=true'),
      ],
    })
    const summary = summarizeProbeForLog(result)
    expect(summary).toContain('zoom=2:ok/changed')
    expect(summary).toContain('torch=true:fail')
  })

  it('reports "none" when no constraint probes were run', () => {
    const result = minimalProbeResult({ constraintProbes: [] })
    expect(summarizeProbeForLog(result)).toContain('probes=[none]')
  })

  it('reports ok/same when probe succeeded but setting did not change', () => {
    const probe: ConstraintProbeResult = {
      constraint: 'zoom=1',
      attempted: true,
      success: true,
      errorName: null,
      errorMessage: null,
      settingsBefore: { zoom: 1 },
      settingsAfter: { zoom: 1 },
      settingChanged: false,
    }
    const result = minimalProbeResult({ constraintProbes: [probe] })
    expect(summarizeProbeForLog(result)).toContain('zoom=1:ok/same')
  })
})
