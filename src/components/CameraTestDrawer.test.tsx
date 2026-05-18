import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CameraTestDrawer } from './CameraTestDrawer'
import type { CameraCapabilities } from '../adapters/camera'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const asyncNoop = async () => undefined

/** Minimal valid props with no capabilities and the drawer open. */
function baseProps(overrides: Partial<React.ComponentProps<typeof CameraTestDrawer>> = {}) {
  return {
    open: true,
    capabilities: null,
    devices: [],
    previewRatio: 'full' as const,
    logText: '',
    onClose: vi.fn(),
    onChangePreviewRatio: vi.fn(),
    onSelectDevice: vi.fn(),
    onApplyConstraint: vi.fn(asyncNoop),
    onCopyLog: vi.fn(),
    onClearLog: vi.fn(),
    onRunProbe: vi.fn(asyncNoop),
    statusMessage: '',
    errorMessage: '',
    ...overrides,
  }
}

/** Minimal CameraCapabilities with zoom + torch. */
function capabilitiesWithZoomAndTorch(): CameraCapabilities {
  return {
    zoom: true,
    torch: true,
    focusMode: [],
    facingModes: ['environment'],
    deviceLabels: ['Back Camera'],
    raw: {
      zoom: { min: 1, max: 4, step: 0.1 },
      torch: true,
    } as unknown as MediaTrackCapabilities,
    trackSettings: {
      width: 1280,
      height: 960,
      aspectRatio: undefined,
      facingMode: 'environment',
      deviceId: 'cam-a',
      zoom: 1,
      torch: false,
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
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CameraTestDrawer', () => {
  it('renders nothing when open is false', () => {
    render(<CameraTestDrawer {...baseProps({ open: false })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when open is true', () => {
    render(<CameraTestDrawer {...baseProps()} />)
    expect(screen.getByRole('dialog', { name: 'Camera test controls' })).toBeInTheDocument()
  })

  it('shows the Close button and calls onClose when clicked', () => {
    const onClose = vi.fn()
    render(<CameraTestDrawer {...baseProps({ onClose })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Capability chips
  // -------------------------------------------------------------------------

  it('shows "No extra track capabilities" when capabilities are null', () => {
    render(<CameraTestDrawer {...baseProps({ capabilities: null })} />)
    expect(screen.getByText('No extra track capabilities exposed by this browser.')).toBeInTheDocument()
  })

  it('shows zoom and torch capability chips when capabilities include both', () => {
    render(<CameraTestDrawer {...baseProps({ capabilities: capabilitiesWithZoomAndTorch() })} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('zoom')).toBeInTheDocument()
    expect(within(dialog).getByText('torch')).toBeInTheDocument()
    expect(screen.queryByText('No extra track capabilities exposed by this browser.')).not.toBeInTheDocument()
  })

  it('does not show zoom chip when capabilities.zoom is false', () => {
    const caps = capabilitiesWithZoomAndTorch()
    caps.zoom = false
    caps.raw = { torch: true } as unknown as MediaTrackCapabilities
    render(<CameraTestDrawer {...baseProps({ capabilities: caps })} />)
    // torch chip is still present; zoom chip is absent
    expect(screen.getByText('torch')).toBeInTheDocument()
    expect(screen.queryByText('zoom')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Camera log area
  // -------------------------------------------------------------------------

  it('shows the fallback text when logText is empty', () => {
    render(<CameraTestDrawer {...baseProps({ logText: '' })} />)
    expect(screen.getByText('No camera test actions yet.')).toBeInTheDocument()
  })

  it('shows logText content when logText is non-empty', () => {
    const entry = '[2026-05-18T17:00:00.000Z] Camera Test opened'
    render(<CameraTestDrawer {...baseProps({ logText: entry })} />)
    expect(screen.getByText(entry)).toBeInTheDocument()
    expect(screen.queryByText('No camera test actions yet.')).not.toBeInTheDocument()
  })

  it('calls onCopyLog when Copy camera logs button is clicked', () => {
    const onCopyLog = vi.fn()
    render(<CameraTestDrawer {...baseProps({ onCopyLog })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy camera logs' }))
    expect(onCopyLog).toHaveBeenCalledTimes(1)
  })

  it('calls onClearLog when Clear camera logs button is clicked', () => {
    const onClearLog = vi.fn()
    render(<CameraTestDrawer {...baseProps({ onClearLog })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear camera logs' }))
    expect(onClearLog).toHaveBeenCalledTimes(1)
  })

  it('shows the Run capability probe button when drawer is open', () => {
    render(<CameraTestDrawer {...baseProps()} />)
    expect(screen.getByRole('button', { name: 'Run capability probe' })).toBeInTheDocument()
  })

  it('calls onRunProbe when Run capability probe button is clicked', () => {
    const onRunProbe = vi.fn(asyncNoop)
    render(<CameraTestDrawer {...baseProps({ onRunProbe })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run capability probe' }))
    expect(onRunProbe).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Aspect ratio select
  // -------------------------------------------------------------------------

  it('calls onChangePreviewRatio with the selected value when aspect ratio is changed', () => {
    const onChangePreviewRatio = vi.fn()
    render(<CameraTestDrawer {...baseProps({ onChangePreviewRatio, previewRatio: 'full' })} />)
    // The aspect ratio select is the only combobox visible when devices <= 1.
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1:1' } })
    expect(onChangePreviewRatio).toHaveBeenCalledWith('1:1')
  })

  it('reflects the current previewRatio as the selected option', () => {
    render(<CameraTestDrawer {...baseProps({ previewRatio: '4:3' })} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('4:3')
  })

  // -------------------------------------------------------------------------
  // Status and error messages
  // -------------------------------------------------------------------------

  it('renders statusMessage when non-empty', () => {
    render(<CameraTestDrawer {...baseProps({ statusMessage: 'Constraint applied.' })} />)
    expect(screen.getByText('Constraint applied.')).toBeInTheDocument()
  })

  it('does not render empty statusMessage', () => {
    render(<CameraTestDrawer {...baseProps({ statusMessage: '' })} />)
    // No element should contain only the empty string as visible text — just
    // verify statusMessage conditional is not producing a visible node.
    expect(screen.queryByText('Constraint applied.')).not.toBeInTheDocument()
  })

  it('renders errorMessage when non-empty', () => {
    render(<CameraTestDrawer {...baseProps({ errorMessage: 'Camera setting failed.' })} />)
    expect(screen.getByText('Camera setting failed.')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Live summary reflects previewRatio and capability count
  // -------------------------------------------------------------------------

  it('shows previewRatio in the Live summary section', () => {
    render(<CameraTestDrawer {...baseProps({ previewRatio: '16:9' })} />)
    // "16:9" appears in both the aspect ratio <option> and the Live summary <span>.
    // Confirm at least one is a <span> (the Live summary row value).
    const matches = screen.getAllByText('16:9')
    const spans = matches.filter((el) => el.tagName === 'SPAN')
    expect(spans.length).toBeGreaterThan(0)
  })

  it('shows capability count of 0 when capabilities are null', () => {
    render(<CameraTestDrawer {...baseProps({ capabilities: null })} />)
    expect(screen.getByText('0 exposed')).toBeInTheDocument()
  })

  it('shows correct capability count when zoom and torch are present', () => {
    render(<CameraTestDrawer {...baseProps({ capabilities: capabilitiesWithZoomAndTorch() })} />)
    expect(screen.getByText('2 exposed')).toBeInTheDocument()
  })
})
