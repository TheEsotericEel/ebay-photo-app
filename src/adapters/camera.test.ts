import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserCameraAdapter, type CameraTestConstraintSet } from './camera'

type MockSettings = MediaTrackSettings & {
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

type MockCapabilityRange = { min: number; max: number; step: number }

function setNavigatorMediaDevices(getUserMedia: ReturnType<typeof vi.fn>, enumerateDevices = vi.fn(async () => [])) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia,
      enumerateDevices,
    },
    configurable: true,
  })
}

function makeTrack(
  label: string,
  settings: MockSettings,
  capabilities: MediaTrackCapabilities & {
    zoom?: MockCapabilityRange
    focusMode?: string[]
    focusDistance?: MockCapabilityRange
    pointsOfInterest?: { x: number; y: number }[]
    torch?: boolean
    exposureMode?: string[]
    exposureTime?: MockCapabilityRange
    exposureCompensation?: MockCapabilityRange
    whiteBalanceMode?: string[]
    brightness?: MockCapabilityRange
    contrast?: MockCapabilityRange
    saturation?: MockCapabilityRange
    sharpness?: MockCapabilityRange
    iso?: MockCapabilityRange
  },
) {
  const state = { ...settings }
  const track = {
    kind: 'video',
    enabled: true,
    muted: false,
    readyState: 'live' as const,
    id: `${label}-id`,
    label,
    getCapabilities: vi.fn(() => capabilities),
    getSettings: vi.fn(() => ({ ...state })),
    applyConstraints: vi.fn(async (constraints: MediaTrackConstraints) => {
      const advanced = (constraints.advanced?.[0] as Record<string, unknown> | undefined) || {}

      if (advanced.width && typeof advanced.width === 'object' && 'ideal' in advanced.width) {
        state.width = (advanced.width as ConstrainULongRange).ideal as number | undefined
      }
      if (advanced.height && typeof advanced.height === 'object' && 'ideal' in advanced.height) {
        state.height = (advanced.height as ConstrainULongRange).ideal as number | undefined
      }
      if (advanced.aspectRatio !== undefined) {
        state.aspectRatio = typeof advanced.aspectRatio === 'number'
          ? advanced.aspectRatio
          : (advanced.aspectRatio as ConstrainDoubleRange).ideal as number | undefined
      }
      if (advanced.zoom !== undefined) {
        state.zoom = typeof advanced.zoom === 'number'
          ? advanced.zoom
          : (advanced.zoom as ConstrainDoubleRange).ideal as number | undefined
      }
      if (advanced.torch !== undefined) {
        state.torch = Boolean(advanced.torch)
      }
      if (advanced.focusMode !== undefined) {
        state.focusMode = typeof advanced.focusMode === 'string'
          ? advanced.focusMode
          : Array.isArray(advanced.focusMode)
            ? advanced.focusMode[0]
            : (advanced.focusMode as ConstrainDOMStringParameters).ideal as string | undefined
      }
      if (advanced.focusDistance !== undefined) {
        state.focusDistance = typeof advanced.focusDistance === 'number'
          ? advanced.focusDistance
          : (advanced.focusDistance as ConstrainDoubleRange).ideal as number | undefined
      }
    }),
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    clone: vi.fn(),
    getConstraints: vi.fn(() => ({})),
  } as unknown as MediaStreamTrack & {
    getCapabilities: () => typeof capabilities
    getSettings: () => MockSettings
    applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>
    stop: () => void
  }

  return { track, state }
}

function makeStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: 'stream-id',
  } as unknown as MediaStream
}

describe('BrowserCameraAdapter', () => {
  const originalSecureContext = window.isSecureContext

  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      value: originalSecureContext,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  it('probes extended track settings on start', async () => {
    const { track } = makeTrack(
      'cam-a',
      {
        width: 1280,
        height: 960,
        aspectRatio: 1.333,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 1.5,
        torch: true,
        focusMode: 'single-shot',
        focusDistance: 0.42,
        exposureMode: 'auto',
        exposureTime: 16,
        exposureCompensation: 0.25,
        whiteBalanceMode: 'continuous',
        brightness: 0.1,
        contrast: 1.2,
        saturation: 0.8,
        sharpness: 0.4,
        iso: 400,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
        zoom: { min: 1, max: 4, step: 0.1 },
        torch: true,
        focusMode: ['auto', 'single-shot'],
        focusDistance: { min: 0, max: 1, step: 0.1 },
        exposureMode: ['auto'],
        exposureTime: { min: 1, max: 1000, step: 1 },
        exposureCompensation: { min: -2, max: 2, step: 0.1 },
        whiteBalanceMode: ['continuous'],
        brightness: { min: 0, max: 1, step: 0.1 },
        contrast: { min: 0, max: 2, step: 0.1 },
        saturation: { min: 0, max: 2, step: 0.1 },
        sharpness: { min: 0, max: 2, step: 0.1 },
        iso: { min: 100, max: 1600, step: 100 },
      },
    )
    const stream = makeStream(track)
    const getUserMedia = vi.fn(async () => stream)
    setNavigatorMediaDevices(getUserMedia)

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined)

    const adapter = new BrowserCameraAdapter()
    await adapter.start(videoEl)

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(adapter.getCapabilities()?.trackSettings).toMatchObject({
      width: 1280,
      height: 960,
      aspectRatio: 1.333,
      facingMode: 'environment',
      deviceId: 'cam-a',
      zoom: 1.5,
      torch: true,
      focusMode: 'single-shot',
      focusDistance: 0.42,
      exposureMode: 'auto',
      exposureTime: 16,
      exposureCompensation: 0.25,
      whiteBalanceMode: 'continuous',
      brightness: 0.1,
      contrast: 1.2,
      saturation: 0.8,
      sharpness: 0.4,
      iso: 400,
    })
  })

  it('applies constraints in place without restarting the stream', async () => {
    const { track } = makeTrack(
      'cam-a',
      {
        width: 1280,
        height: 960,
        aspectRatio: 1.333,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 1,
        torch: true,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
        zoom: { min: 1, max: 4, step: 0.1 },
        torch: true,
      },
    )
    const stream = makeStream(track)
    const getUserMedia = vi.fn(async () => stream)
    setNavigatorMediaDevices(getUserMedia)

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined)

    const adapter = new BrowserCameraAdapter()
    await adapter.start(videoEl)
    await adapter.applyTestConstraints({ zoom: 2, focusMode: 'manual' } as CameraTestConstraintSet)

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
    expect(adapter.getCapabilities()?.trackSettings).toMatchObject({
      zoom: 2,
      focusMode: 'manual',
    })
  })

  it('toggles torch off and reflects the verified state', async () => {
    const { track } = makeTrack(
      'cam-a',
      {
        width: 1280,
        height: 960,
        aspectRatio: 1.333,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 1,
        torch: true,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
        torch: true,
      },
    )
    const stream = makeStream(track)
    const getUserMedia = vi.fn(async () => stream)
    setNavigatorMediaDevices(getUserMedia)

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined)

    const adapter = new BrowserCameraAdapter()
    await adapter.start(videoEl)
    await adapter.applyTestConstraints({ torch: false })

    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
    expect(adapter.getCapabilities()?.trackSettings?.torch).toBe(false)
  })

  it('changes aspect ratio without restarting the stream', async () => {
    const { track } = makeTrack(
      'cam-a',
      {
        width: 1280,
        height: 960,
        aspectRatio: 1.333,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 1,
        torch: false,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
      },
    )
    const stream = makeStream(track)
    const getUserMedia = vi.fn(async () => stream)
    setNavigatorMediaDevices(getUserMedia)

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined)

    const adapter = new BrowserCameraAdapter()
    await adapter.start(videoEl)
    await adapter.applyTestConstraints({ aspectRatio: 1 })

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.applyConstraints).toHaveBeenCalledTimes(1)
  })

  it('restarts only when switching to a different device', async () => {
    const { track: trackA } = makeTrack(
      'cam-a',
      {
        width: 1280,
        height: 960,
        aspectRatio: 1.333,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 1,
        torch: false,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
      },
    )
    const { track: trackB } = makeTrack(
      'cam-b',
      {
        width: 1920,
        height: 1080,
        aspectRatio: 1.777,
        facingMode: 'environment',
        deviceId: 'cam-b',
        zoom: 1.2,
        torch: false,
      },
      {
        width: { min: 640, max: 4032, step: 1 } as any,
        height: { min: 480, max: 3024, step: 1 } as any,
      },
    )

    const streamA = makeStream(trackA)
    const streamB = makeStream(trackB)
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const deviceId = (constraints.video as MediaTrackConstraints & { deviceId?: ConstrainDOMString })?.deviceId
      if (typeof deviceId === 'object' && deviceId && 'exact' in deviceId && deviceId.exact === 'cam-b') {
        return streamB
      }
      return streamA
    })
    setNavigatorMediaDevices(getUserMedia)

    const videoEl = document.createElement('video')
    vi.spyOn(videoEl, 'play').mockResolvedValue(undefined)

    const adapter = new BrowserCameraAdapter()
    await adapter.start(videoEl)
    await adapter.switchDevice('cam-b')

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(trackA.stop).toHaveBeenCalledTimes(1)
    expect(adapter.getCapabilities()?.trackSettings?.deviceId).toBe('cam-b')

    await adapter.switchDevice('cam-b')
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })
})
