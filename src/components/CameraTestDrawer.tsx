import type { CSSProperties } from 'react'
import { CameraCapabilities, CameraDeviceInfo, CameraTestConstraintSet } from '../adapters/camera'
import { OutputRatio } from '../adapters/imageProcessing'

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

interface Props {
  open: boolean
  capabilities: CameraCapabilities | null
  devices: CameraDeviceInfo[]
  previewRatio: OutputRatio
  logText: string
  onClose: () => void
  onChangePreviewRatio: (ratio: OutputRatio) => void
  onSelectDevice: (deviceId: string) => void
  onApplyConstraint: (constraint: CameraTestConstraintSet) => Promise<void>
  onCopyLog: () => void
  onClearLog: () => void
  onRunProbe: () => Promise<void>
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
  summary: {
    display: 'grid',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    border: '1px solid #232323',
    background: '#111111',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: '#cbd5e1',
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
  note: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  buttonRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
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
  rawList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
}

function formatValue(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '?'
  if (Math.abs(value) >= 10) return value.toFixed(0)
  if (Math.abs(value) >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

function toExtendedCapabilities(capabilities: CameraCapabilities | null): ExtendedMediaTrackCapabilities | null {
  return (capabilities?.raw as ExtendedMediaTrackCapabilities | null) || null
}

function toExtendedSettings(capabilities: CameraCapabilities | null): ExtendedMediaTrackSettings | null {
  return (capabilities?.trackSettings as ExtendedMediaTrackSettings | null) || null
}

function CapabilityRange({
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

function CapabilitySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: string[]
  onChange: (value: string) => void
}) {
  if (options.length === 0) return null

  const current = value && options.includes(value) ? value : options[0]

  return (
    <div style={s.rangeRow}>
      <div style={s.label}>{label}</div>
      <select style={s.select} value={current} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CameraTestDrawer({
  open,
  capabilities,
  devices,
  previewRatio,
  logText,
  onClose,
  onChangePreviewRatio,
  onSelectDevice,
  onApplyConstraint,
  onCopyLog,
  onClearLog,
  onRunProbe,
  statusMessage,
  errorMessage,
}: Props) {
  if (!open) return null

  const raw = toExtendedCapabilities(capabilities)
  const settings = toExtendedSettings(capabilities)
  const capabilityList: string[] = []
  if (capabilities?.zoom) capabilityList.push('zoom')
  if (capabilities?.torch) capabilityList.push('torch')
  if (raw?.whiteBalanceMode) capabilityList.push('whiteBalanceMode')
  if (devices.length > 1) capabilityList.push('device/lens')
  if (raw?.focusDistance && Number.isFinite(raw.focusDistance.min) && Number.isFinite(raw.focusDistance.max) && raw.focusDistance.max > raw.focusDistance.min) {
    capabilityList.push('focusDistance (exp)')
  }

  const currentDeviceId = settings?.deviceId || capabilities?.trackSettings?.deviceId || ''
  const currentDevice = devices.find((device) => device.deviceId === currentDeviceId) || null
  const unsupportedControls = ['exposure', 'ISO', 'brightness', 'contrast', 'saturation', 'sharpness', 'colorTemperature']
  const focusDistanceSupported =
    Boolean(
      raw?.focusDistance &&
      Number.isFinite(raw.focusDistance.min) &&
      Number.isFinite(raw.focusDistance.max) &&
      raw.focusDistance.max > raw.focusDistance.min &&
      typeof settings?.focusDistance === 'number',
    )
  const focusDistanceRange = raw?.focusDistance && Number.isFinite(raw.focusDistance.min) && Number.isFinite(raw.focusDistance.max) && raw.focusDistance.max > raw.focusDistance.min

  return (
    <div style={s.sheet} role="dialog" aria-modal="true" aria-label="Camera test controls">
      <div style={s.header}>
        <div style={s.titleBlock}>
          <div style={s.title}>Camera Test</div>
          <div style={s.subtitle}>Temporary controls for browser capability testing. Nothing here affects upload or item storage.</div>
        </div>
        <button style={s.closeButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={s.summary}>
        <div style={s.summaryRow}>
          <span>Current device</span>
          <span>{currentDevice?.label || capabilities?.deviceLabels[0] || 'Unknown'}</span>
        </div>
        <div style={s.summaryRow}>
          <span>Track</span>
          <span>
            {settings?.width ?? '?'}x{settings?.height ?? '?'} • {settings?.facingMode || '?'} • {settings?.zoom !== undefined ? `zoom ${formatValue(settings.zoom)}` : 'zoom ?'}
          </span>
        </div>
        <div style={s.summaryRow}>
          <span>ImageCapture</span>
          <span>takePhoto info lives in the log</span>
        </div>
        <div style={s.chipRow}>
          {capabilityList.length === 0 ? (
            <span style={s.note}>No extra track capabilities exposed by this browser.</span>
          ) : (
            capabilityList.map((cap) => (
              <span key={cap} style={s.chip}>{cap}</span>
            ))
          )}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Preview</div>
        <div style={s.note}>Aspect ratio only changes the crop. It does not restart the stream or affect saved output.</div>
        <CapabilitySelect
          label="Aspect ratio (preview only)"
          value={previewRatio}
          options={['full', '1:1', '4:3', '16:9']}
          onChange={(value) => onChangePreviewRatio(value as OutputRatio)}
        />
        <div style={s.note}>
          Temporary test mode stays preview-only. Width/height stream constraints are intentionally disabled.
        </div>
      </div>

      {devices.length > 1 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Device / lens</div>
          <div style={s.note}>Switching devices may restart the stream. That is expected for this test.</div>
          <div style={s.rangeRow}>
            <div style={s.label}>Camera device</div>
            <select style={s.select} value={currentDeviceId} onChange={(e) => onSelectDevice(e.target.value)}>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || device.deviceId}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {raw?.zoom && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Zoom</div>
          <div style={s.note}>Use pinch on the preview or move the slider. Browser behavior varies by device.</div>
          <CapabilityRange
            label="Zoom"
            value={settings?.zoom}
            capability={raw.zoom}
            onChange={(value) => { void onApplyConstraint({ zoom: value }).catch(() => undefined) }}
          />
        </div>
      )}

      {capabilities?.torch && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Torch</div>
          <div style={s.toggleRow}>
            <button
              style={{ ...s.toggleButton, ...(settings?.torch ? s.toggleButtonActive : {}) }}
              onClick={() => { void onApplyConstraint({ torch: !settings?.torch }).catch(() => undefined) }}
            >
              {settings?.torch ? 'Torch on' : 'Torch off'}
            </button>
          </div>
        </div>
      )}

      {raw?.whiteBalanceMode && raw.whiteBalanceMode.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>White balance</div>
          <div style={s.note}>This is a confirmed browser-supported test control on Safari PWA probe results.</div>
          <CapabilitySelect
            label="White balance mode"
            value={settings?.whiteBalanceMode}
            options={raw.whiteBalanceMode}
            onChange={(value) => { void onApplyConstraint({ whiteBalanceMode: value }).catch(() => undefined) }}
          />
        </div>
      )}

      {focusDistanceRange && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Focus distance</div>
          <div style={s.note}>Experimental and disabled unless the browser reflects the setting in getSettings().</div>
          {focusDistanceSupported ? (
            <CapabilityRange
              label="Focus distance"
              value={settings?.focusDistance}
              capability={raw.focusDistance}
              onChange={(value) => { void onApplyConstraint({ focusDistance: value }).catch(() => undefined) }}
            />
          ) : (
            <div style={s.note}>focusDistance is exposed but not currently confirmed enough to test.</div>
          )}
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>Unsupported / unconfirmed</div>
        <div style={s.note}>
          {unsupportedControls.join(', ')} are hidden for now because they were not confirmed stable in Safari PWA probe results.
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Camera log</div>
        <div style={s.buttonRow}>
          <button style={s.toggleButton} onClick={() => { void onRunProbe().catch(() => undefined) }}>
            Run capability probe
          </button>
          <button style={s.toggleButton} onClick={onCopyLog}>
            Copy camera logs
          </button>
          <button style={s.toggleButton} onClick={onClearLog}>
            Clear camera logs
          </button>
        </div>
        <pre style={{ margin: 0, maxHeight: 170, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#cbd5e1', fontSize: 11, lineHeight: 1.5 }}>
          {logText || 'No camera test actions yet.'}
        </pre>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Live summary</div>
        <div style={s.summaryRow}>
          <span>Aspect ratio</span>
          <span>{previewRatio}</span>
        </div>
        <div style={s.summaryRow}>
          <span>Capabilities</span>
          <span>{capabilityList.length > 0 ? capabilityList.length : 0} exposed</span>
        </div>
        {statusMessage && <div style={s.status}>{statusMessage}</div>}
        {errorMessage && <div style={s.error}>{errorMessage}</div>}
        {raw && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: '#9ca3af', fontSize: 12, fontWeight: 700 }}>
              Raw capability JSON
            </summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#94a3b8', fontSize: 10 }}>
              {JSON.stringify(raw, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
