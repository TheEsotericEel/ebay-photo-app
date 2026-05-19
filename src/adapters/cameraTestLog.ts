import { CameraCapabilities } from './camera'
import { OutputRatio } from './imageProcessing'

export interface CameraTestVideoState {
  readyState: number
  paused: boolean
  width: number
  height: number
  hasSrcObject: boolean
}

export interface CameraTestTrackState {
  readyState: string
  muted: boolean
  enabled: boolean
  label: string
}

export interface CameraTestLogEntryInput {
  action: string
  ratio?: OutputRatio
  requested?: string
  outcome?: 'ok' | 'failed' | 'skipped'
  note?: string
  error?: string
  videoState?: CameraTestVideoState | null
  trackState?: CameraTestTrackState | null
  beforeSettings?: CameraCapabilities['trackSettings'] | null
  afterSettings?: CameraCapabilities['trackSettings'] | null
  settings?: CameraCapabilities['trackSettings'] | null
}

function formatMaybe(value: unknown): string {
  if (value === undefined || value === null) return '?'
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '?'
    if (Math.abs(value) >= 10) return value.toFixed(0)
    if (Math.abs(value) >= 1) return value.toFixed(2)
    return value.toFixed(3)
  }
  return String(value)
}

function formatSettings(settings: CameraCapabilities['trackSettings'] | null | undefined): string {
  if (!settings) return 'settings=?'

  const parts = [
    `device=${settings.deviceId || '?'}`,
    `facing=${settings.facingMode || '?'}`,
    `zoom=${formatMaybe(settings.zoom)}`,
    `torch=${formatMaybe(settings.torch)}`,
    `wb=${formatMaybe(settings.whiteBalanceMode)}`,
  ]

  if (settings.focusDistance !== undefined) {
    parts.push(`focusDistance=${formatMaybe(settings.focusDistance)}`)
  }
  if (settings.frameRate !== undefined) {
    parts.push(`fps=${formatMaybe(settings.frameRate)}`)
  }

  return parts.join(' ')
}

function formatVideoState(state: CameraTestVideoState | null | undefined): string {
  if (!state) return 'video=?'
  return `video=rs${state.readyState} ${state.width}x${state.height} paused=${state.paused} attached=${state.hasSrcObject}`
}

function formatTrackState(state: CameraTestTrackState | null | undefined): string {
  if (!state) return 'track=?'
  return `track=${state.readyState} muted=${state.muted} enabled=${state.enabled} label=${state.label || '?'}`
}

export function formatCameraTestLogEntry(input: CameraTestLogEntryInput): string {
  const parts = [
    new Date().toISOString(),
    `action=${input.action}`,
  ]

  if (input.ratio) {
    parts.push(`ratio=${input.ratio}`)
  }
  if (input.requested) {
    parts.push(`constraints=${input.requested}`)
  }
  if (input.outcome) {
    parts.push(`outcome=${input.outcome}`)
  }

  parts.push(formatVideoState(input.videoState))
  parts.push(formatTrackState(input.trackState))
  if (input.beforeSettings || input.afterSettings) {
    parts.push(`before=${formatSettings(input.beforeSettings)}`)
    parts.push(`after=${formatSettings(input.afterSettings)}`)
  }
  parts.push(formatSettings(input.settings))

  if (input.note) {
    parts.push(`note=${input.note}`)
  }
  if (input.error) {
    parts.push(`error=${input.error}`)
  }

  return parts.join(' | ')
}

export function buildCameraTestLogText(entries: string[]): string {
  if (entries.length === 0) {
    return 'No camera test actions yet.'
  }

  return [
    '=== CAMERA TEST LOG ===',
    ...entries,
    '=== END CAMERA TEST LOG ===',
  ].join('\n')
}
