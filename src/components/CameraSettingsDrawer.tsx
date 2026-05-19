import type { CSSProperties } from 'react'
import { CameraCapabilities } from '../adapters/camera'

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  focusDistance?: { min: number; max: number; step: number }
}

interface ExtendedMediaTrackSettings extends MediaTrackSettings {
  focusDistance?: number
}

interface Props {
  open: boolean
  capabilities: CameraCapabilities | null
  previewQualityEnabled: boolean
  onClose: () => void
  onTogglePreviewQuality: () => void
  onApplyConstraint: (constraint: { focusDistance?: number }) => Promise<void>
  statusMessage: string
  errorMessage: string
}

const s: Record<string, CSSProperties> = {
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '52dvh',
    overflow: 'auto',
    background: 'rgba(12, 12, 12, 0.96)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 18,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
    padding: 12,
    zIndex: 6,
    display: 'grid',
    gap: 10,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  titleBlock: {
    display: 'grid',
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: 800,
    color: '#f2f2f2',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  closeButton: {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#1a1a1a',
    color: '#eee',
    fontSize: 12,
    fontWeight: 700,
  },
  section: {
    display: 'grid',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: '1px solid #232323',
    background: '#111111',
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#9ca3af',
    fontWeight: 800,
  },
  note: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#9ca3af',
    fontWeight: 700,
  },
  select: {
    width: '100%',
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#171717',
    color: '#f2f2f2',
    fontSize: 13,
  },
  rangeRow: {
    display: 'grid',
    gap: 6,
  },
  rangeMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 11,
    color: '#9ca3af',
  },
  range: {
    width: '100%',
  },
  toggleRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  toggleButton: {
    padding: '9px 11px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#1b1b1b',
    color: '#eee',
    fontSize: 12,
    fontWeight: 700,
  },
  toggleButtonActive: {
    background: '#f2f2f2',
    color: '#111',
    borderColor: '#f2f2f2',
  },
  status: {
    fontSize: 12,
    color: '#93c5fd',
    lineHeight: 1.45,
  },
  error: {
    fontSize: 12,
    color: '#f87171',
    lineHeight: 1.45,
  },
  chipRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    padding: '3px 8px',
    borderRadius: 999,
    background: '#1c1c1c',
    color: '#e5e7eb',
    fontSize: 11,
    border: '1px solid #2a2a2a',
  },
}

function formatValue(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '?'
  if (Math.abs(value) >= 10) return value.toFixed(0)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

function toCapabilities(capabilities: CameraCapabilities | null): ExtendedMediaTrackCapabilities | null {
  return (capabilities?.raw as ExtendedMediaTrackCapabilities | null) || null
}

function toSettings(capabilities: CameraCapabilities | null): ExtendedMediaTrackSettings | null {
  return (capabilities?.trackSettings as ExtendedMediaTrackSettings | null) || null
}

function RangeControl({
  label,
  value,
  capability,
  onChange,
}: {
  label: string
  value: number | undefined
  capability: { min: number; max: number; step: number } | undefined
  onChange: (value: number) => void
}) {
  if (!capability) return null

  const min = capability.min ?? 0
  const max = capability.max ?? 1
  const step = capability.step ?? 0.1
  const current = value ?? min

  return (
    <div style={s.rangeRow}>
      <div style={s.rangeMeta}>
        <span>{label}</span>
        <span>{formatValue(current)} / {formatValue(max)}</span>
      </div>
      <input
        style={s.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function CameraSettingsDrawer({
  open,
  capabilities,
  previewQualityEnabled,
  onClose,
  onTogglePreviewQuality,
  onApplyConstraint,
  statusMessage,
  errorMessage,
}: Props) {
  if (!open) return null

  const raw = toCapabilities(capabilities)
  const settings = toSettings(capabilities)
  const focusDistanceRange = raw?.focusDistance && Number.isFinite(raw.focusDistance.min) && Number.isFinite(raw.focusDistance.max) && raw.focusDistance.max > raw.focusDistance.min
  const focusDistanceSupported = Boolean(focusDistanceRange && typeof settings?.focusDistance === 'number')

  return (
    <div style={s.sheet} role="dialog" aria-modal="true" aria-label="Camera settings">
      <div style={s.header}>
        <div style={s.titleBlock}>
          <div style={s.title}>Overflow Controls</div>
          <div style={s.subtitle}>Less-common controls that do not need to live on the main camera screen.</div>
        </div>
        <button style={s.closeButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Preview quality</div>
        <div style={s.note}>Temporary inspector mode for checking live preview detail without changing capture output.</div>
        <div style={s.toggleRow}>
          <button
            style={{ ...s.toggleButton, ...(previewQualityEnabled ? s.toggleButtonActive : {}) }}
            onClick={onTogglePreviewQuality}
          >
            {previewQualityEnabled ? 'Full-quality preview on' : 'Full-quality preview off'}
          </button>
        </div>
      </div>

      {focusDistanceRange && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Focus distance</div>
          <div style={s.note}>Shown only when the browser reports a valid range and reflects the setting in getSettings().</div>
          {focusDistanceSupported ? (
            <RangeControl
              label="Focus distance"
              value={settings?.focusDistance}
              capability={raw.focusDistance}
              onChange={(value) => { void onApplyConstraint({ focusDistance: value }).catch(() => undefined) }}
            />
          ) : (
            <div style={s.note}>Not enough browser support to expose focus distance here yet.</div>
          )}
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>Live summary</div>
        <div style={s.chipRow}>
          {focusDistanceRange ? <span style={s.chip}>focus distance</span> : null}
          {previewQualityEnabled ? <span style={s.chip}>preview test on</span> : <span style={s.chip}>preview test off</span>}
        </div>
        {statusMessage && <div style={s.status}>{statusMessage}</div>}
        {errorMessage && <div style={s.error}>{errorMessage}</div>}
      </div>
    </div>
  )
}
