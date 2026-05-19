import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraPreview, CameraPreviewHandle } from '../components/CameraPreview'
import { CameraSettingsDrawer } from '../components/CameraSettingsDrawer'
import { CameraTestDrawer } from '../components/CameraTestDrawer'
import { CaptureMetadataOverlay } from '../components/CaptureMetadataOverlay'
import { DiagnosticsPanel } from '../components/DiagnosticsPanel'
import { PhotoDetailModal } from '../components/PhotoDetailModal'
import { PhotoList } from '../components/PhotoList'
import { CanvasImageProcessingAdapter, OutputRatio, loadDefaultRatioFromStorage, saveDefaultRatioToStorage } from '../adapters/imageProcessing'
import { IndexedDbPhotoStore, StoredPhoto } from '../adapters/localPhotoStore'
import { IndexedDbItemPacketStore, ItemPacket, ListingStatus } from '../adapters/itemPacket'
import { syncBatchToSupabase, BatchUploadProgress } from '../adapters/supabaseUpload'
import { attachOrderedPhotosToItem, getItemReadiness, sortItems } from '../adapters/itemHelpers'
import { getBatchUploadStateSummary, getCleanupReport } from '../adapters/uploadState'
import { calculateRetentionWindow, getRetentionModeLabel, RemoteRetentionMode } from '../adapters/retention'
import { deleteEligibleRemotePhotos, getRemoteCleanupReport, RemoteCleanupProgress } from '../adapters/remoteCleanup'
import { probeSecureContext, SecureContextInfo } from '../adapters/secureContext'
import { BatchRecord, IndexedDbWorkflowStore, StoreRecord } from '../adapters/workflowStore'
import { CameraCapabilities, CameraDeviceInfo, CameraTestConstraintSet, CaptureDiagnostics } from '../adapters/camera'
import { runCameraProbe, summarizeProbeForLog } from '../adapters/cameraProbe'
import { buildCameraTestLogText, formatCameraTestLogEntry } from '../adapters/cameraTestLog'
import { supabase } from '../lib/supabase'
import { APP_NAME, SUPABASE_STORAGE_BUCKET } from '../lib/appConfig'
import { loadCameraPermissionGranted, saveCameraPermissionGranted } from '../lib/cameraPermission'
import { loadCameraPreferences, saveCameraPreferences } from '../adapters/cameraPreferences'
import { DesktopMode, loadWorkspacePreferences, saveWorkspacePreferences } from '../lib/workspacePreferences'
import { useSupabaseSession } from '../lib/useSupabaseSession'
import { useIsMobile } from '../lib/useViewportMode'

const imageProcessor = new CanvasImageProcessingAdapter()
const photoStore = new IndexedDbPhotoStore()
const itemPacketStore = new IndexedDbItemPacketStore()
const workflowStore = new IndexedDbWorkflowStore()
const secureContextInfo: SecureContextInfo = probeSecureContext()

type CameraState = 'idle' | 'starting' | 'active' | 'stopped' | 'error'
type QueueFilter = 'all' | ListingStatus
export type { DesktopMode }

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

function formatLensPresetLabel(value: number): string {
  if (value <= 0.75) return '.5'
  return '1x'
}

function isPresetActive(current: number | undefined, preset: number): boolean {
  if (current === undefined || Number.isNaN(current)) return false
  const tolerance = Math.max(0.03, preset * 0.08)
  return Math.abs(current - preset) <= tolerance
}

function formatCameraDeviceLabel(label: string): string {
  const normalized = label.trim()
  const lower = normalized.toLowerCase()

  if (lower.includes('back triple')) return 'Rear Triple'
  if (lower.includes('back dual')) return 'Rear Dual'
  if (lower.includes('back wide')) return 'Rear Wide'
  if (lower.includes('back')) return 'Rear'
  if (lower.includes('front')) return 'Front'

  return normalized
    .replace(/camera/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFrontCameraLabel(label: string): boolean {
  const lower = formatCameraDeviceLabel(label).toLowerCase()
  return lower.includes('front') || lower.includes('selfie')
}

function isUltraWideHint(label: string): boolean {
  const lower = formatCameraDeviceLabel(label).toLowerCase()
  return lower.includes('ultra') || lower.includes('0.5') || lower.includes('dual wide')
}

function isMainRearHint(label: string): boolean {
  const lower = formatCameraDeviceLabel(label).toLowerCase()
  return (
    lower.includes('wide')
    || lower.includes('main')
    || lower.includes('triple')
    || lower.includes('dual')
    || lower === 'rear'
  )
}

function scoreDeviceForZoomPreset(deviceLabel: string, zoom: number): number {
  const label = formatCameraDeviceLabel(deviceLabel).toLowerCase()
  const band = zoom <= 0.75
    ? 'ultra'
    : zoom < 1.5
      ? 'main'
      : zoom < 2.5
        ? 'tele2'
        : zoom < 4.5
          ? 'tele3'
          : 'telemax'

  let score = 0
  if (band === 'ultra') {
    if (label.includes('ultra')) score += 400
    if (label.includes('0.5')) score += 350
    if (label.includes('wide')) score += 240
    if (label.includes('rear')) score += 30
  } else if (band === 'main') {
    if (label.includes('main')) score += 400
    if (label.includes('wide')) score += 260
    if (label.includes('triple')) score += 220
    if (label.includes('rear')) score += 40
  } else if (band === 'tele2') {
    if (label.includes('tele')) score += 420
    if (label.includes('2')) score += 360
    if (label.includes('rear')) score += 45
  } else if (band === 'tele3') {
    if (label.includes('tele')) score += 420
    if (label.includes('3')) score += 360
    if (label.includes('rear')) score += 45
  } else {
    if (label.includes('tele')) score += 420
    if (label.includes('zoom')) score += 360
    if (label.includes('rear')) score += 45
  }

  if (label.includes('triple')) score += 5
  if (label.includes('dual')) score += 3
  if (label.includes('back')) score += 2

  return score
}

function pickCameraDeviceForZoomPreset(devices: CameraDeviceInfo[], zoom: number, currentDeviceId?: string): CameraDeviceInfo | null {
  if (devices.length === 0) {
    return null
  }

  const currentDevice = currentDeviceId ? devices.find((device) => device.deviceId === currentDeviceId) || null : null
  const scored = devices
    .map((device) => ({
      device,
      score: scoreDeviceForZoomPreset(device.label || device.deviceId, zoom),
    }))
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return null
  }

  const best = scored[0]
  if (best.score <= 0) {
    return currentDevice
  }

  return best.device
}

function getRearCameraDevices(devices: CameraDeviceInfo[]): CameraDeviceInfo[] {
  return devices.filter((device) => !isFrontCameraLabel(device.label || device.deviceId))
}

function pickMainRearDevice(devices: CameraDeviceInfo[]): CameraDeviceInfo | null {
  const rearDevices = getRearCameraDevices(devices)
  if (rearDevices.length === 0) return null

  const preferred =
    rearDevices.find((device) => isMainRearHint(device.label || device.deviceId) && !isUltraWideHint(device.label || device.deviceId))
    || rearDevices.find((device) => isMainRearHint(device.label || device.deviceId))
    || rearDevices[0]

  return preferred ?? null
}

function pickUltraWideRearDevice(devices: CameraDeviceInfo[], mainDeviceId?: string): CameraDeviceInfo | null {
  const rearDevices = getRearCameraDevices(devices)
  if (rearDevices.length === 0) return null

  const explicitUltra =
    rearDevices.find((device) => isUltraWideHint(device.label || device.deviceId) && device.deviceId !== mainDeviceId)
    || null
  if (explicitUltra) return explicitUltra

  const alternates = rearDevices.filter((device) => device.deviceId !== mainDeviceId)
  if (alternates.length === 0) return null

  return (
    alternates.find((device) => !isMainRearHint(device.label || device.deviceId))
    || alternates[0]
  )
}

function getAvailableLensPresets(devices: CameraDeviceInfo[]): number[] {
  const mainDevice = pickMainRearDevice(devices)
  const ultraWideDevice = pickUltraWideRearDevice(devices, mainDevice?.deviceId)

  const presets: number[] = []
  if (ultraWideDevice && mainDevice && ultraWideDevice.deviceId !== mainDevice.deviceId) {
    presets.push(0.5)
  }
  if (mainDevice) {
    presets.push(1)
  }

  return presets.length > 0 ? presets : [1]
}

const s: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    gap: 16,
    padding: '12px 0 24px',
    maxWidth: 1100,
    margin: '0 auto',
  },
  shell: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 16,
    padding: '0 12px',
  },
  panel: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 14,
    padding: 14,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#f2f2f2',
  },
  subtitle: {
    fontSize: 12,
    color: '#8b8b8b',
    marginTop: 4,
  },
  row: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    color: '#8b8b8b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#171717',
    color: '#eee',
    fontSize: 14,
  },
  button: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#1c1c1c',
    color: '#eee',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  buttonPrimary: {
    background: '#f2f2f2',
    color: '#111',
    border: '1px solid #f2f2f2',
  },
  buttonDanger: {
    background: 'transparent',
    color: '#f87171',
    border: '1px solid #7f1d1d',
  },
  buttonSmall: {
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 8,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  stat: {
    background: '#171717',
    border: '1px solid #252525',
    borderRadius: 10,
    padding: 10,
  },
  statValue: {
    fontSize: 18,
    color: '#f2f2f2',
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    color: '#8b8b8b',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#a8a8a8',
    marginBottom: 10,
  },
  queueItem: {
    display: 'flex',
    gap: 12,
    border: '1px solid #242424',
    borderRadius: 12,
    background: '#151515',
    padding: 10,
    marginBottom: 10,
  },
  queueThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    objectFit: 'cover',
    background: '#202020',
    flexShrink: 0,
  },
  queueThumbFallback: {
    width: 72,
    height: 72,
    borderRadius: 10,
    background: '#202020',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    flexShrink: 0,
  },
  queueContent: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'baseline',
    marginBottom: 4,
  },
  queueNumber: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f2f2f2',
  },
  queueBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeNew: {
    background: '#1f2937',
    color: '#93c5fd',
  },
  badgeListed: {
    background: '#11341e',
    color: '#4ade80',
  },
  badgeHold: {
    background: '#3a2510',
    color: '#fbbf24',
  },
  badgeRetake: {
    background: '#3a1a1a',
    color: '#f87171',
  },
  badgeUnknown: {
    background: '#1f1f1f',
    color: '#9ca3af',
  },
  queueMeta: {
    fontSize: 12,
    color: '#8b8b8b',
    lineHeight: 1.5,
  },
  queueActions: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  filterButton: {
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid #2b2b2b',
    background: '#161616',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 12,
  },
  filterButtonActive: {
    background: '#e5e7eb',
    color: '#111',
    borderColor: '#e5e7eb',
  },
  authPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    background: '#151515',
    display: 'grid',
    gap: 10,
  },
  authGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: 8,
    alignItems: 'center',
  },
  authLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 12,
    color: '#a8a8a8',
    flexWrap: 'wrap',
  },
  progressBox: {
    padding: 10,
    borderRadius: 10,
    border: '1px solid #27303a',
    background: '#111827',
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 1.5,
  },
  empty: {
    fontSize: 13,
    color: '#777',
    padding: 16,
    border: '1px dashed #2b2b2b',
    borderRadius: 12,
    background: '#141414',
  },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)',
    gap: 16,
    alignItems: 'start',
  },
  mobileScreen: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minHeight: '100dvh',
    height: '100dvh',
    padding: '12px',
    maxWidth: 560,
    margin: '0 auto',
    overflow: 'hidden',
  },
  mobileHome: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '100%',
    gap: 16,
  },
  mobileHero: {
    display: 'grid',
    gap: 10,
    paddingTop: 6,
  },
  mobileHeroTitle: {
    fontSize: 28,
    fontWeight: 850,
    color: '#f2f2f2',
    letterSpacing: -0.5,
    lineHeight: 1.05,
  },
  mobileHeroCopy: {
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 1.45,
    maxWidth: 420,
  },
  mobileHomeCard: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 18,
    padding: 14,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
  },
  mobileSummary: {
    display: 'grid',
    gap: 8,
  },
  mobileSummaryLine: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 1.45,
  },
  mobileSubtle: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 1.5,
  },
  mobileLaunchArea: {
    display: 'grid',
    gap: 10,
  },
  mobileStatusStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
  },
  mobileStatusChip: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 14,
    padding: 10,
    display: 'grid',
    gap: 3,
  },
  mobileStatusChipLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: '#9ca3af',
    fontWeight: 800,
  },
  mobileStatusChipValue: {
    fontSize: 13,
    fontWeight: 800,
    color: '#f2f2f2',
    lineHeight: 1.25,
  },
  mobileStatusChipMeta: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 1.35,
  },
  mobileLaunchButton: {
    padding: '18px 14px',
    fontSize: 18,
    borderRadius: 14,
  },
  mobileActionRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  mobileCameraSession: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: '100dvh',
    overflow: 'hidden',
    background: '#000',
  },
  mobileCameraViewport: {
    position: 'relative',
    flex: '1 1 auto',
    minHeight: 0,
    background: '#000',
    touchAction: 'none',
  },
  mobileLensControl: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 4,
    display: 'flex',
    gap: 6,
  },
  mobileLensButton: {
    minWidth: 48,
    height: 34,
    padding: '0 10px',
    borderRadius: 999,
    border: '1px solid rgba(255, 255, 255, 0.18)',
    background: 'rgba(16, 16, 16, 0.92)',
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: -0.1,
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.25)',
  },
  mobileLensButtonActive: {
    background: '#f2f2f2',
    color: '#111',
    borderColor: '#f2f2f2',
  },
  mobileCameraTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 3,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    gap: 8,
    alignItems: 'center',
  },
  mobileCameraTopCenter: {
    display: 'grid',
    gap: 2,
    justifyItems: 'center',
    padding: '8px 10px',
    borderRadius: 14,
    background: 'rgba(8, 8, 8, 0.88)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  mobileTopButton: {
    background: 'rgba(12, 12, 12, 0.92)',
    color: '#f2f2f2',
    border: '1px solid rgba(255, 255, 255, 0.12)',
  },
  mobileTopActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  mobileCameraShell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    gap: 12,
  },
  mobileCameraTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  mobileCameraTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f2f2f2',
  },
  mobileCameraMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  mobileCameraCard: {
    background: '#111111',
    border: '1px solid #262626',
    borderRadius: 18,
    overflow: 'hidden',
    boxShadow: '0 16px 32px rgba(0, 0, 0, 0.28)',
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
  },
  mobileCameraBody: {
    padding: 14,
    display: 'grid',
    gap: 10,
  },
  mobileStatusLine: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 1.5,
  },
  mobileCameraBottomBar: {
    position: 'relative',
    zIndex: 3,
    display: 'grid',
    gap: 8,
    padding: '0 12px 10px',
  },
  mobileCaptureStatus: {
    fontSize: 11,
    color: '#cbd5e1',
    lineHeight: 1.35,
  },
  mobileQuickControls: {
    display: 'grid',
    gap: 8,
    padding: 0,
    background: 'transparent',
  },
  mobileQuickControlsTitle: {
    fontSize: 10,
    color: '#7f8ea3',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 800,
  },
  mobileQuickSection: {
    display: 'grid',
    gap: 5,
  },
  mobileQuickSectionLabel: {
    fontSize: 9,
    color: '#7f8ea3',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: 800,
  },
  mobileQuickPillRow: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  mobileQuickPill: {
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid #262626',
    background: '#141414',
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: 700,
  },
  mobileQuickPillActive: {
    background: '#f2f2f2',
    color: '#111',
    borderColor: '#f2f2f2',
  },
  mobileQuickPillMuted: {
    color: '#cbd5e1',
  },
  mobileQuickSelectorRow: {
    display: 'grid',
    gap: 4,
  },
  mobileQuickSelectorLabel: {
    fontSize: 9,
    color: '#7f8ea3',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: 800,
  },
  mobileQuickSelectorGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 8,
  },
  mobileQuickSelect: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid #262626',
    background: '#141414',
    color: '#eee',
    fontSize: 12,
  },
  mobileQuickSubtleRow: {
    display: 'grid',
    gap: 6,
  },
  mobileQuickSplitRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  mobileQuickControlRow: {
    display: 'grid',
    gap: 8,
  },
  mobileQuickControlLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 700,
  },
  mobileQuickControlValueRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  mobileQuickRange: {
    width: '100%',
  },
  mobileRatioRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 6,
  },
  mobileCaptureActions: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.9fr)',
    gap: 8,
  },
  mobileSmallButton: {
    padding: '10px 10px',
    borderRadius: 10,
    fontSize: 12,
  },
  mobilePrimaryButton: {
    padding: '14px 12px',
    fontSize: 16,
  },
  mobileFooter: {
    display: 'grid',
    gap: 10,
  },
  desktopScreen: {
    height: '100dvh',
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: 12,
    gap: 12,
  },
  desktopFrame: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'auto auto auto 1fr',
    gap: 12,
    overflow: 'hidden',
  },
  desktopTopBar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    padding: '14px 16px',
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 16,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
  },
  desktopTitleBlock: {
    display: 'grid',
    gap: 4,
  },
  desktopTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#f2f2f2',
    letterSpacing: -0.2,
  },
  desktopSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  desktopTabs: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  desktopTab: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid #2b2b2b',
    background: '#161616',
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  desktopTabActive: {
    background: '#e5e7eb',
    color: '#111',
    borderColor: '#e5e7eb',
  },
  desktopContext: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 12,
    minHeight: 0,
    overflow: 'hidden',
  },
  desktopContextCard: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 16,
    padding: 14,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  desktopContextTitle: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#a8a8a8',
  },
  desktopContextBody: {
    display: 'grid',
    gap: 10,
    minHeight: 0,
  },
  desktopStatusStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
    minHeight: 0,
  },
  statusChip: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 14,
    padding: 12,
    minHeight: 0,
    display: 'grid',
    gap: 4,
  },
  statusChipLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#9ca3af',
    fontWeight: 800,
  },
  statusChipValue: {
    fontSize: 15,
    fontWeight: 800,
    color: '#f2f2f2',
    lineHeight: 1.2,
  },
  statusChipMeta: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.35,
  },
  statusToneGood: {
    borderColor: '#1f4d2f',
    background: '#0f1712',
  },
  statusToneWarn: {
    borderColor: '#5a4314',
    background: '#17130c',
  },
  statusToneBad: {
    borderColor: '#5a1e1e',
    background: '#180f0f',
  },
  statusToneNeutral: {
    borderColor: '#242424',
    background: '#121212',
  },
  desktopPanel: {
    background: '#121212',
    border: '1px solid #242424',
    borderRadius: 16,
    padding: 14,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.22)',
  },
  desktopPanelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  desktopPanelTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f2f2f2',
    letterSpacing: -0.2,
  },
  desktopPanelMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  desktopGrid: {
    display: 'grid',
    gap: 12,
    minHeight: 0,
    flex: 1,
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  },
  desktopStack: {
    display: 'grid',
    gap: 12,
    minHeight: 0,
    flex: 1,
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
  },
  desktopScrollList: {
    minHeight: 0,
    overflow: 'auto',
    paddingRight: 6,
  },
  desktopToolsGrid: {
    display: 'grid',
    gap: 12,
    minHeight: 0,
    flex: 1,
    gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)',
  },
}

type StatusTone = 'good' | 'warn' | 'bad' | 'neutral'

interface StatusChipModel {
  label: string
  value: string
  meta: string
  tone: StatusTone
}

function getUploadLifecycleLabel(item: ItemPacket): StatusChipModel {
  if (item.remoteStatus === 'deleted') {
    return {
      label: 'Upload',
      value: 'Deleted',
      meta: 'Remote object already removed',
      tone: 'neutral',
    }
  }

  if (item.uploadStatus === 'failed' || item.remoteStatus === 'failed') {
    return {
      label: 'Upload',
      value: 'Failed',
      meta: 'Retry sync to repair the batch',
      tone: 'bad',
    }
  }

  if (item.uploadStatus === 'verified' && item.remoteStatus === 'verified') {
    return {
      label: 'Upload',
      value: 'Verified',
      meta: 'Local and remote copies match',
      tone: 'good',
    }
  }

  if (item.uploadStatus === 'uploading' || item.remoteStatus === 'uploading') {
    return {
      label: 'Upload',
      value: 'Uploading',
      meta: 'Photos are moving to Supabase',
      tone: 'warn',
    }
  }

  if (item.uploadStatus === 'queued' || item.remoteStatus === 'queued') {
    return {
      label: 'Upload',
      value: 'Queued',
      meta: 'Waiting for the next sync pass',
      tone: 'warn',
    }
  }

  return {
    label: 'Upload',
    value: 'Local',
    meta: 'Captured locally, not synced yet',
    tone: 'neutral',
  }
}

function getCleanupLifecycleLabel(item: ItemPacket): StatusChipModel {
  if (item.remoteStatus === 'deleted') {
    return {
      label: 'Cleanup',
      value: 'Deleted',
      meta: 'Remote assets are gone',
      tone: 'neutral',
    }
  }

  if (item.listingStatus !== 'listed') {
    return {
      label: 'Cleanup',
      value: 'Not listed',
      meta: 'Remote cleanup waits for listing',
      tone: 'neutral',
    }
  }

  if (item.remoteExpiresAt) {
    const expiresAt = new Date(item.remoteExpiresAt)
    const expired = expiresAt.getTime() <= Date.now()
    return {
      label: 'Cleanup',
      value: expired ? 'Eligible now' : 'Waiting',
      meta: expired
        ? `Delete allowed since ${expiresAt.toLocaleDateString()}`
        : `Delete after ${expiresAt.toLocaleDateString()}`,
      tone: expired ? 'good' : 'warn',
    }
  }

  return {
    label: 'Cleanup',
    value: 'Pending',
    meta: 'Retention date not assigned yet',
    tone: 'warn',
  }
}

function getHandoffLifecycleLabel(readiness: ReturnType<typeof getItemReadiness>): StatusChipModel {
  return readiness.readyForHandoff
    ? {
        label: 'Capture',
        value: 'Ready',
        meta: `${readiness.photoCount} ordered • ${readiness.missingPhotoCount} missing`,
        tone: 'good',
      }
    : {
        label: 'Capture',
        value: 'Needs info',
        meta: `${readiness.photoCount} ordered • ${readiness.missingPhotoCount} missing`,
        tone: 'warn',
      }
}

function getUploadBatchLabel(summary: ReturnType<typeof getBatchUploadStateSummary>): StatusChipModel {
  if (summary.failedPhotos > 0) {
    return {
      label: 'Batch sync',
      value: 'Needs retry',
      meta: `${summary.verifiedPhotos}/${summary.totalPhotos} verified`,
      tone: 'bad',
    }
  }

  if (summary.pendingPhotos > 0) {
    return {
      label: 'Batch sync',
      value: 'Pending',
      meta: `${summary.verifiedPhotos}/${summary.totalPhotos} verified`,
      tone: 'warn',
    }
  }

  if (summary.totalPhotos === 0) {
    return {
      label: 'Batch sync',
      value: 'Empty',
      meta: 'Capture an item to start',
      tone: 'neutral',
    }
  }

  return {
    label: 'Batch sync',
    value: 'Verified',
    meta: `${summary.verifiedPhotos}/${summary.totalPhotos} verified`,
    tone: 'good',
  }
}

function WorkspaceStatusStrip({
  cameraState,
  cameraPermissionRemembered,
  authLoading,
  authError,
  supabaseReady,
  session,
  uploading,
  uploadProgress,
  batchUploadSummary,
  cleanupReport,
  remoteCleanupReport,
  remoteCleaning,
  selectedStore,
  selectedBatch,
}: {
  cameraState: CameraState
  cameraPermissionRemembered: boolean
  authLoading: boolean
  authError: string | null
  supabaseReady: boolean
  session: { user: { email?: string | null; id: string } } | null
  uploading: boolean
  uploadProgress: BatchUploadProgress | null
  batchUploadSummary: ReturnType<typeof getBatchUploadStateSummary>
  cleanupReport: ReturnType<typeof getCleanupReport>
  remoteCleanupReport: ReturnType<typeof getRemoteCleanupReport> | null
  remoteCleaning: boolean
  selectedStore: StoreRecord | null
  selectedBatch: BatchRecord | null
}) {
  const cameraChip: StatusChipModel = cameraState === 'active'
    ? {
        label: 'Camera',
        value: 'Ready',
        meta: cameraPermissionRemembered ? 'Permission remembered' : 'Permission granted',
        tone: 'good',
      }
    : cameraState === 'starting'
      ? {
          label: 'Camera',
          value: 'Starting',
          meta: 'Waiting for the live feed',
          tone: 'warn',
        }
      : cameraState === 'error'
        ? {
            label: 'Camera',
            value: 'Error',
            meta: 'Open diagnostics if capture fails',
            tone: 'bad',
          }
        : {
            label: 'Camera',
            value: cameraPermissionRemembered ? 'Saved' : 'Idle',
            meta: cameraPermissionRemembered ? 'Ready to resume' : 'Tap capture to request access',
            tone: 'neutral',
          }

  const authChip: StatusChipModel = authLoading
    ? {
        label: 'Auth',
        value: 'Loading',
        meta: 'Checking session',
        tone: 'neutral',
      }
    : !supabaseReady
      ? {
          label: 'Auth',
          value: 'Setup needed',
          meta: 'Missing Supabase env vars',
          tone: 'warn',
        }
      : session
        ? {
            label: 'Auth',
            value: 'Signed in',
            meta: session.user.email || session.user.id,
            tone: 'good',
          }
        : {
            label: 'Auth',
            value: 'Signed out',
            meta: authError || 'Magic link sign-in ready',
            tone: authError ? 'bad' : 'neutral',
          }

  const uploadChip = uploading
    ? ({
        label: 'Batch sync',
        value: uploadProgress?.message || 'Syncing',
        meta: selectedBatch ? `${selectedStore?.name || 'Store'} / ${selectedBatch.name}` : 'Preparing upload',
        tone: 'warn',
      } satisfies StatusChipModel)
    : getUploadBatchLabel(batchUploadSummary)

  const cleanupChip: StatusChipModel = remoteCleaning
    ? {
        label: 'Cleanup',
        value: 'Deleting',
        meta: 'Remote assets are being removed',
        tone: 'warn',
      }
    : cleanupReport.safeToClear && (remoteCleanupReport?.eligiblePhotos || 0) > 0
      ? {
          label: 'Cleanup',
          value: 'Ready',
          meta: `${remoteCleanupReport?.eligiblePhotos || 0} remote photos eligible`,
          tone: 'good',
        }
      : cleanupReport.safeToClear
        ? {
            label: 'Cleanup',
            value: 'Local clear ready',
            meta: 'Verified photos can be removed locally',
            tone: 'good',
          }
        : cleanupReport.issues.length > 0
          ? {
              label: 'Cleanup',
              value: 'Blocked',
              meta: `${cleanupReport.issues.map((issue) => `${issue.count} ${issue.reason}`).join(' • ')}`,
              tone: 'bad',
            }
          : {
              label: 'Cleanup',
              value: 'Waiting',
              meta: remoteCleanupReport?.nextEligibleAt
                ? `Next eligible ${new Date(remoteCleanupReport.nextEligibleAt).toLocaleDateString()}`
                : getRetentionModeLabel(selectedBatch?.remoteRetentionMode || 'delete_7d_after_listed'),
              tone: 'neutral',
            }

  const batchChip: StatusChipModel = selectedStore && selectedBatch
    ? {
        label: 'Workspace',
        value: `${selectedStore.shortCode} / ${selectedBatch.name}`,
        meta: `${batchUploadSummary.totalItems} items • ${batchUploadSummary.totalPhotos} photos`,
        tone: 'neutral',
      }
    : {
        label: 'Workspace',
        value: 'Unselected',
        meta: 'Choose a store and batch',
        tone: 'neutral',
      }

  return (
    <div style={s.desktopStatusStrip}>
      {[cameraChip, authChip, uploadChip, cleanupChip, batchChip].map((chip) => (
        <div
          key={`${chip.label}-${chip.value}`}
          style={{
            ...s.statusChip,
            ...(chip.tone === 'good'
              ? s.statusToneGood
              : chip.tone === 'warn'
                ? s.statusToneWarn
                : chip.tone === 'bad'
                  ? s.statusToneBad
                  : s.statusToneNeutral),
          }}
        >
          <div style={s.statusChipLabel}>{chip.label}</div>
          <div style={s.statusChipValue}>{chip.value}</div>
          <div style={s.statusChipMeta}>{chip.meta}</div>
        </div>
      ))}
    </div>
  )
}

function ItemLifecycleStrip({
  item,
  readiness,
  compact = false,
}: {
  item: ItemPacket
  readiness: ReturnType<typeof getItemReadiness>
  compact?: boolean
}) {
  const uploadChip = getUploadLifecycleLabel(item)
  const cleanupChip = getCleanupLifecycleLabel(item)
  const captureChip = getHandoffLifecycleLabel(readiness)

  return (
    <div style={{ ...s.desktopStatusStrip, gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(140px, 1fr))' : s.desktopStatusStrip.gridTemplateColumns }}>
      {[captureChip, uploadChip, cleanupChip].map((chip) => (
        <div
          key={`${chip.label}-${chip.value}`}
          style={{
            ...s.statusChip,
            ...(chip.tone === 'good'
              ? s.statusToneGood
              : chip.tone === 'warn'
                ? s.statusToneWarn
                : chip.tone === 'bad'
                  ? s.statusToneBad
                  : s.statusToneNeutral),
          }}
        >
          <div style={s.statusChipLabel}>{chip.label}</div>
          <div style={s.statusChipValue}>{chip.value}</div>
          <div style={s.statusChipMeta}>{chip.meta}</div>
        </div>
      ))}
    </div>
  )
}

function MobileWorkspaceStatusStrip({
  mode,
  selectedStore,
  selectedBatch,
  batchUploadSummary,
  cameraPermissionRemembered,
  cameraState,
  currentItem,
  currentItemReadiness,
  supabaseReady,
  session,
  authLoading,
}: {
  mode: 'home' | 'camera'
  selectedStore: StoreRecord | null
  selectedBatch: BatchRecord | null
  batchUploadSummary: ReturnType<typeof getBatchUploadStateSummary>
  cameraPermissionRemembered: boolean
  cameraState: CameraState
  currentItem: ItemPacket | null
  currentItemReadiness: ReturnType<typeof getItemReadiness> | null
  supabaseReady: boolean
  session: { user: { email?: string | null; id: string } } | null
  authLoading: boolean
}) {
  const workspaceChip: StatusChipModel = selectedStore && selectedBatch
    ? {
        label: 'Workspace',
        value: `${selectedStore.shortCode} / ${selectedBatch.name}`,
        meta: `${batchUploadSummary.totalItems} items • ${batchUploadSummary.totalPhotos} photos`,
        tone: 'neutral',
      }
    : {
        label: 'Workspace',
        value: 'Unselected',
        meta: 'Choose a store and batch',
        tone: 'neutral',
      }

  const syncChip: StatusChipModel = !supabaseReady
    ? {
        label: 'Sync',
        value: 'Setup needed',
        meta: 'Missing Supabase env vars',
        tone: 'warn',
      }
    : authLoading
      ? {
          label: 'Sync',
          value: 'Loading',
          meta: 'Checking session',
          tone: 'neutral',
        }
      : session
        ? getUploadBatchLabel(batchUploadSummary)
        : {
            label: 'Sync',
            value: 'Signed out',
            meta: 'Magic link sign-in required',
            tone: 'warn',
          }

  const thirdChip: StatusChipModel = mode === 'home'
    ? cameraState === 'active'
      ? {
          label: 'Camera',
          value: 'Ready',
          meta: cameraPermissionRemembered ? 'Permission remembered' : 'Permission granted',
          tone: 'good',
        }
      : cameraPermissionRemembered
        ? {
            label: 'Camera',
            value: 'Saved',
            meta: 'Tap to resume',
            tone: 'neutral',
          }
        : {
            label: 'Camera',
            value: 'Off',
            meta: 'Tap Open Camera',
            tone: 'neutral',
          }
    : currentItem
      ? {
          label: 'Item',
          value: `#${currentItem.itemNumber}`,
          meta: currentItemReadiness?.readyForHandoff ? 'Ready for handoff' : 'Needs info',
          tone: currentItemReadiness?.readyForHandoff ? 'good' : 'warn',
        }
      : {
          label: 'Item',
          value: 'None',
          meta: 'Capture the first item',
          tone: 'neutral',
        }

  return (
    <div style={s.mobileStatusStrip}>
      {[workspaceChip, syncChip, thirdChip].map((chip) => (
        <div
          key={`${mode}-${chip.label}-${chip.value}`}
          style={{
            ...s.mobileStatusChip,
            ...(chip.tone === 'good'
              ? s.statusToneGood
              : chip.tone === 'warn'
                ? s.statusToneWarn
                : chip.tone === 'bad'
                  ? s.statusToneBad
                  : s.statusToneNeutral),
          }}
        >
          <div style={s.mobileStatusChipLabel}>{chip.label}</div>
          <div style={s.mobileStatusChipValue}>{chip.value}</div>
          <div style={s.mobileStatusChipMeta}>{chip.meta}</div>
        </div>
      ))}
    </div>
  )
}

function MobileWorkspace({
  mobileMode,
  selectedStore,
  selectedBatch,
  batchUploadSummary,
  cameraPermissionRemembered,
  cameraState,
  capabilities,
  cameraSettingsPreviewQuality,
  cameraSettingsOpen,
  cameraSettingsMessage,
  cameraSettingsError,
  cameraTestOpen,
  cameraDevices,
  cameraTestMessage,
  cameraTestError,
  currentItem,
  currentItemReadiness,
  supabaseReady,
  session,
  authLoading,
  cameraPreviewRatio,
  selectedRatio,
  preferredZoom,
  cameraRef,
  handleCameraError,
  handleCameraStarted,
  setCameraState,
  handleRatioChange,
  handlePreviewClick,
  handlePreviewTouchStart,
  handlePreviewTouchMove,
  handlePreviewTouchEnd,
  handleOpenCameraSettings,
  handleCloseCameraSettings,
  handleToggleCameraSettingsPreviewQuality,
  handleApplyCameraSettingConstraint,
  handleApplyLensPreset,
  handleOpenCameraTest,
  handleCloseCameraTest,
  handleSelectCameraDevice,
  handleApplyCameraTestConstraint,
  handleChangeCameraTestPreviewRatio,
  cameraTestLogText,
  handleCopyCameraTestLog,
  handleClearCameraTestLog,
  handleRunCameraProbe,
  capturing,
  selectedStoreId,
  selectedBatchId,
  handleCapture,
  statusMsg,
  handleNextItem,
  handleDoneSession,
  itemSku,
  itemWeight,
  itemDimensions,
  setItemSku,
  setItemWeight,
  setItemDimensions,
  metadataOverlayOpen,
  setMetadataOverlayOpen,
  handleOpenCamera,
  handleSyncBatch,
  setMobileMode,
}: {
  mobileMode: 'home' | 'camera'
  selectedStore: StoreRecord | null
  selectedBatch: BatchRecord | null
  batchUploadSummary: ReturnType<typeof getBatchUploadStateSummary>
  cameraPermissionRemembered: boolean
  cameraState: CameraState
  capabilities: CameraCapabilities | null
  cameraSettingsPreviewQuality: boolean
  cameraSettingsOpen: boolean
  cameraSettingsMessage: string
  cameraSettingsError: string
  cameraTestOpen: boolean
  cameraDevices: CameraDeviceInfo[]
  cameraTestMessage: string
  cameraTestError: string
  currentItem: ItemPacket | null
  currentItemReadiness: ReturnType<typeof getItemReadiness> | null
  supabaseReady: boolean
  session: { user: { email?: string | null; id: string } } | null
  authLoading: boolean
  cameraPreviewRatio: OutputRatio
  selectedRatio: OutputRatio
  preferredZoom: number
  cameraRef: React.RefObject<CameraPreviewHandle>
  handleCameraError: (msg: string) => void
  handleCameraStarted: () => void
  setCameraState: (state: CameraState) => void
  handleRatioChange: (ratio: OutputRatio) => void
  handlePreviewClick: (event: React.MouseEvent<HTMLDivElement>) => void
  handlePreviewTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void
  handlePreviewTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void
  handlePreviewTouchEnd: () => void
  handleOpenCameraSettings: () => void
  handleCloseCameraSettings: () => void
  handleToggleCameraSettingsPreviewQuality: () => void
  handleApplyCameraSettingConstraint: (constraint: CameraTestConstraintSet) => Promise<void>
  handleApplyLensPreset: (preset: number) => Promise<void>
  handleOpenCameraTest: () => void
  handleCloseCameraTest: () => void
  handleSelectCameraDevice: (deviceId: string) => void
  handleApplyCameraTestConstraint: (constraint: CameraTestConstraintSet) => Promise<void>
  handleChangeCameraTestPreviewRatio: (ratio: OutputRatio) => void
  cameraTestLogText: string
  handleCopyCameraTestLog: () => void
  handleClearCameraTestLog: () => void
  handleRunCameraProbe: () => Promise<void>
  capturing: boolean
  selectedStoreId: string
  selectedBatchId: string
  handleCapture: () => Promise<void>
  statusMsg: string
  handleNextItem: () => Promise<void>
  handleDoneSession: () => Promise<void>
  itemSku: string
  itemWeight: string
  itemDimensions: string
  setItemSku: (value: string) => void
  setItemWeight: (value: string) => void
  setItemDimensions: (value: string) => void
  metadataOverlayOpen: boolean
  setMetadataOverlayOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleOpenCamera: () => Promise<void>
  handleSyncBatch: () => Promise<void>
  setMobileMode: React.Dispatch<React.SetStateAction<'home' | 'camera'>>
}) {
  const rawCapabilities = capabilities?.raw as ExtendedMediaTrackCapabilities | null
  const currentLensPreset = preferredZoom <= 0.75 ? 0.5 : 1
  const availableLensChoices = useMemo(() => getAvailableLensPresets(cameraDevices), [cameraDevices])

  if (mobileMode === 'camera') {
    return (
      <div style={{ ...s.mobileScreen, padding: 0, maxWidth: 'none' }}>
        <div style={s.mobileCameraSession}>
          <div
            style={s.mobileCameraViewport}
            onClick={handlePreviewClick}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onTouchCancel={handlePreviewTouchEnd}
          >
            <CameraPreview
              ref={cameraRef}
              onError={handleCameraError}
              onStarted={handleCameraStarted}
              onStopped={() => setCameraState('stopped')}
              ratio={cameraPreviewRatio}
              fit="full-frame"
            />

            {availableLensChoices.length > 0 && (
              <div style={s.mobileLensControl}>
                {availableLensChoices.map((preset) => (
                  <button
                    key={preset}
                    style={{
                      ...s.mobileLensButton,
                      ...(currentLensPreset === preset ? s.mobileLensButtonActive : {}),
                    }}
                    onClick={() => {
                      void handleApplyLensPreset(preset)
                    }}
                    aria-label={`Use ${formatLensPresetLabel(preset)} lens`}
                  >
                    {formatLensPresetLabel(preset)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={s.mobileCameraTopBar}>
            <button
              style={{ ...s.button, ...s.buttonSmall, ...s.mobileTopButton }}
              onClick={() => {
                if (metadataOverlayOpen) {
                  setMetadataOverlayOpen(false)
                  return
                }
                if (cameraSettingsOpen) {
                  handleCloseCameraSettings()
                  return
                }
                if (cameraTestOpen) {
                  handleCloseCameraTest()
                  return
                }
                setMobileMode('home')
              }}
            >
              Back
            </button>
            <div style={s.mobileCameraTopCenter}>
              <div style={s.mobileCameraTitle}>
                {currentItem ? `Item ${currentItem.itemNumber}` : 'Capture'}
              </div>
              <div style={s.mobileCameraMeta}>
                {selectedStore?.name || 'Store'} / {selectedBatch?.name || 'Batch'}
                {' '}• {currentItemReadiness?.readyForHandoff ? 'Ready' : 'Needs info'}
              </div>
            </div>
            <div style={s.mobileTopActions}>
              <button
                style={{ ...s.button, ...s.buttonSmall, ...s.mobileTopButton }}
                onClick={() => {
                  if (cameraSettingsOpen) {
                    handleCloseCameraSettings()
                  }
                  if (cameraTestOpen) {
                    handleCloseCameraTest()
                  }
                  setMetadataOverlayOpen((open) => !open)
                }}
              >
                Details
              </button>
              <button
                style={{
                  ...s.button,
                  ...s.buttonSmall,
                  ...s.mobileTopButton,
                  ...(cameraTestOpen ? s.buttonPrimary : {}),
                }}
                onClick={() => {
                  if (cameraTestOpen) {
                    handleCloseCameraTest()
                  } else {
                    handleOpenCameraTest()
                  }
                }}
              >
                Test
              </button>
            </div>
          </div>

          <div style={s.mobileCameraBottomBar}>
            <div style={s.mobileCaptureStatus}>{statusMsg}</div>
            <div style={s.mobileQuickControls}>
              <div style={s.mobileQuickControlsTitle}>Live controls</div>

              <div style={s.mobileQuickSection}>
                <div style={s.mobileQuickSectionLabel}>Aspect ratio</div>
                <div style={s.mobileQuickPillRow}>
                  {(['full', '1:1', '4:3', '16:9'] as OutputRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      style={{
                        ...s.mobileQuickPill,
                        ...(selectedRatio === ratio ? s.mobileQuickPillActive : {}),
                      }}
                      onClick={() => handleRatioChange(ratio)}
                    >
                      {ratio === 'full' ? 'Full' : ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div style={s.mobileQuickSubtleRow}>
                <div style={s.mobileQuickSplitRow}>
                  {rawCapabilities?.torch && (
                    <button
                      style={{
                        ...s.mobileQuickPill,
                        ...(capabilities?.trackSettings?.torch ? s.mobileQuickPillActive : {}),
                      }}
                      onClick={() => {
                        void handleApplyCameraSettingConstraint({ torch: !capabilities?.trackSettings?.torch })
                      }}
                    >
                      {capabilities?.trackSettings?.torch ? 'Torch on' : 'Torch off'}
                    </button>
                  )}
                  <button style={s.mobileQuickPill} onClick={handleOpenCameraSettings}>
                    More
                  </button>
                </div>
              </div>
            </div>
            <div style={s.mobileCaptureActions}>
              <button
                style={{ ...s.button, ...s.buttonPrimary, ...s.mobilePrimaryButton }}
                disabled={capturing || cameraState !== 'active' || !selectedStoreId || !selectedBatchId}
                onClick={handleCapture}
              >
                {capturing ? 'Capturing…' : '⊙ Capture'}
              </button>
              <button
                style={s.button}
                disabled={!currentItem || currentItem.photoIds.length === 0}
                onClick={() => { void handleNextItem() }}
              >
                Next Item
              </button>
              <button
                style={s.button}
                onClick={() => { void handleDoneSession() }}
              >
                Done
              </button>
            </div>
          </div>

          <CaptureMetadataOverlay
            open={metadataOverlayOpen}
            itemLabel={currentItem ? `Item ${currentItem.itemNumber}` : 'New item'}
            sku={itemSku}
            weight={itemWeight}
            dimensions={itemDimensions}
            onChangeSku={setItemSku}
            onChangeWeight={setItemWeight}
            onChangeDimensions={setItemDimensions}
            onClose={() => setMetadataOverlayOpen(false)}
          />

          <CameraSettingsDrawer
            open={cameraSettingsOpen}
            capabilities={capabilities}
            previewQualityEnabled={cameraSettingsPreviewQuality}
            onClose={handleCloseCameraSettings}
            onTogglePreviewQuality={handleToggleCameraSettingsPreviewQuality}
            onApplyConstraint={handleApplyCameraSettingConstraint}
            statusMessage={cameraSettingsMessage}
            errorMessage={cameraSettingsError}
          />

          <CameraTestDrawer
            open={cameraTestOpen}
            capabilities={capabilities}
            devices={cameraDevices}
            previewRatio={cameraPreviewRatio}
            logText={cameraTestLogText}
            onClose={handleCloseCameraTest}
            onChangePreviewRatio={handleChangeCameraTestPreviewRatio}
            onSelectDevice={(deviceId) => { void handleSelectCameraDevice(deviceId) }}
            onApplyConstraint={(constraint) => handleApplyCameraTestConstraint(constraint)}
            onCopyLog={handleCopyCameraTestLog}
            onClearLog={handleClearCameraTestLog}
            onRunProbe={handleRunCameraProbe}
            statusMessage={cameraTestMessage}
            errorMessage={cameraTestError}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={s.mobileScreen}>
      <div style={s.mobileHome}>
        <div style={s.mobileHero}>
          <div>
            <div style={s.mobileHeroTitle}>Capture</div>
            <div style={s.mobileHeroCopy}>
              Tap once to open the camera. Quick status stays visible, everything else stays out of the way.
            </div>
          </div>
        </div>

        <MobileWorkspaceStatusStrip
          mode="home"
          selectedStore={selectedStore}
          selectedBatch={selectedBatch}
          batchUploadSummary={batchUploadSummary}
          cameraPermissionRemembered={cameraPermissionRemembered}
          cameraState={cameraState}
          currentItem={currentItem}
          currentItemReadiness={currentItemReadiness}
          supabaseReady={supabaseReady}
          session={session}
          authLoading={authLoading}
        />

        <div style={s.mobileLaunchArea}>
          <button
            style={{ ...s.button, ...s.buttonPrimary, ...s.mobileLaunchButton }}
            onClick={() => { void handleOpenCamera() }}
          >
            {cameraPermissionRemembered ? 'Resume Camera' : 'Open Camera'}
          </button>
          <button
            style={{ ...s.button, ...s.buttonSmall }}
            onClick={() => { void handleSyncBatch() }}
            disabled={!supabaseReady || !session || authLoading || !selectedStoreId || !selectedBatchId}
          >
            {authLoading ? 'Syncing…' : 'Sync Batch'}
          </button>
          {cameraPermissionRemembered && (
            <div style={s.mobileSubtle}>
              Camera permission is remembered for this browser.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function WorkspaceScreen() {
  const cameraRef = useRef<CameraPreviewHandle>(null)
  const pinchStartDistanceRef = useRef<number | null>(null)
  const pinchStartZoomRef = useRef<number | null>(null)
  const pinchLastAppliedZoomRef = useRef<number | null>(null)
  const pinchApplyingRef = useRef(false)
  const restorePreferredZoomPendingRef = useRef(false)
  const isMobile = useIsMobile()
  const { session, loading: authLoading, error: authError, sendMagicLink, signOut, configured: supabaseReady } = useSupabaseSession()
  const [mobileMode, setMobileMode] = useState<'home' | 'camera'>('home')
  const [desktopMode, setDesktopMode] = useState<DesktopMode>(() => loadWorkspacePreferences().desktopMode || 'queue')
  const [cameraPermissionRemembered, setCameraPermissionRemembered] = useState(() => loadCameraPermissionGranted())
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null)
  const [preferredZoom, setPreferredZoom] = useState<number>(() => loadCameraPreferences().preferredZoom ?? 1)
  const [captureErrors, setCaptureErrors] = useState<string[]>([])
  const [storageErrors, setStorageErrors] = useState<string[]>([])
  const [allPhotos, setAllPhotos] = useState<StoredPhoto[]>([])
  const [allItems, setAllItems] = useState<ItemPacket[]>([])
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [batches, setBatches] = useState<BatchRecord[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [currentItem, setCurrentItem] = useState<ItemPacket | null>(null)
  const [itemSku, setItemSku] = useState('')
  const [itemNote, setItemNote] = useState('')
  const [itemWeight, setItemWeight] = useState('')
  const [itemDimensions, setItemDimensions] = useState('')
  const [metadataOverlayOpen, setMetadataOverlayOpen] = useState(false)
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false)
  const [cameraSettingsMessage, setCameraSettingsMessage] = useState('Open Camera Settings to adjust live controls.')
  const [cameraSettingsError, setCameraSettingsError] = useState('')
  const [cameraSettingsPreviewQuality, setCameraSettingsPreviewQuality] = useState(false)
  const [cameraTestOpen, setCameraTestOpen] = useState(false)
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceInfo[]>([])
  const [cameraTestMessage, setCameraTestMessage] = useState('Open Camera Test to inspect controls.')
  const [cameraTestError, setCameraTestError] = useState('')
  const [cameraTestPreviewRatio, setCameraTestPreviewRatio] = useState<OutputRatio>('full')
  const [cameraTestLogEntries, setCameraTestLogEntries] = useState<string[]>([])
  const [capturing, setCapturing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Workspace ready')
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null)
  const [selectedRatio, setSelectedRatio] = useState<OutputRatio>(() => loadDefaultRatioFromStorage())
  const [lastCaptureDiagnostics, setLastCaptureDiagnostics] = useState<CaptureDiagnostics | null>(null)
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('new')
  const [selectedQueueItemId, setSelectedQueueItemId] = useState<string>('')
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState<BatchUploadProgress | null>(null)
  const [remoteCleanupProgress, setRemoteCleanupProgress] = useState<RemoteCleanupProgress | null>(null)
  const [uploading, setUploading] = useState(false)
  const [remoteCleaning, setRemoteCleaning] = useState(false)
  const [cleanupMessage, setCleanupMessage] = useState('')

  useEffect(() => {
    if (!isMobile) {
      setMobileMode('home')
    }
  }, [isMobile])

  useEffect(() => {
    saveWorkspacePreferences({ desktopMode })
  }, [desktopMode])

  useEffect(() => {
    if (selectedStoreId) {
      saveWorkspacePreferences({ selectedStoreId })
    }
  }, [selectedStoreId])

  useEffect(() => {
    if (selectedBatchId) {
      saveWorkspacePreferences({ selectedBatchId })
    }
  }, [selectedBatchId])

  const loadData = useCallback(async () => {
    const [storesData, photosData, itemsData] = await Promise.all([
      workflowStore.getAllStores(),
      photoStore.getAll(),
      itemPacketStore.getAllItems(),
    ])

    setStores(storesData)
    setAllPhotos(photosData)
    setAllItems(itemsData)
  }, [])

  const reloadBatches = useCallback(async (storeId: string) => {
    const batchesData = await workflowStore.getBatches(storeId)
    setBatches(batchesData)
  }, [])

  const refreshCameraTestState = useCallback(async () => {
    const caps = cameraRef.current?.getCapabilities() ?? null
    const dims = cameraRef.current?.getVideoDimensions() ?? null
    if (caps && dims) {
      setCapabilities({
        ...caps,
        trackSettings: caps.trackSettings
          ? {
              ...caps.trackSettings,
              width: caps.trackSettings.width ?? dims.videoWidth,
              height: caps.trackSettings.height ?? dims.videoHeight,
            }
          : {
              width: dims.videoWidth,
              height: dims.videoHeight,
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

    try {
      const devices = await cameraRef.current?.listVideoInputDevices()
      setCameraDevices(devices || [])
    } catch {
      setCameraDevices([])
    }

    return caps
  }, [])

  useEffect(() => {
    async function bootstrap() {
      try {
        const defaultStore = await workflowStore.ensureDefaultStore()
        await workflowStore.ensureDefaultBatch(defaultStore.id)
        const prefs = loadWorkspacePreferences()
        await loadData()
        const storesData = await workflowStore.getAllStores()
        const preferredStore = storesData.find((entry) => entry.id === prefs.selectedStoreId) || defaultStore
        const batchesData = await workflowStore.getBatches(preferredStore.id)
        const preferredBatch =
          batchesData.find((entry) => entry.id === prefs.selectedBatchId && entry.storeId === preferredStore.id) ||
          batchesData.find((entry) => entry.status === 'active') ||
          (await workflowStore.ensureDefaultBatch(preferredStore.id))

        setDesktopMode(prefs.desktopMode || 'queue')
        setSelectedStoreId(preferredStore.id)
        setSelectedBatchId(preferredBatch.id)
        setBatches(batchesData.length > 0 ? batchesData : [preferredBatch])
        const current = await itemPacketStore.getCurrentItem(preferredStore.id, preferredBatch.id)
        setCurrentItem(current)
        if (current) {
          setItemSku(current.sku || '')
          setItemNote(current.note || '')
          setItemWeight(current.weight || '')
          setItemDimensions(current.dimensions || '')
        }
        setStatusMsg(`Ready on ${preferredStore.name} / ${preferredBatch.name}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setStorageErrors((prev) => [...prev, `Bootstrap failed: ${msg}`])
      }
    }

    bootstrap()
  }, [loadData, reloadBatches])

  useEffect(() => {
    if (!selectedStoreId) return
    reloadBatches(selectedStoreId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Batch load failed: ${msg}`])
    })
  }, [reloadBatches, selectedStoreId])

  useEffect(() => {
    if (!selectedStoreId || !selectedBatchId) return
    itemPacketStore.getCurrentItem(selectedStoreId, selectedBatchId).then((item) => {
      setCurrentItem(item)
      if (!item) {
        setItemSku('')
        setItemNote('')
        setItemWeight('')
        setItemDimensions('')
        return
      }
      setItemSku(item.sku || '')
      setItemNote(item.note || '')
      setItemWeight(item.weight || '')
      setItemDimensions(item.dimensions || '')
    })
  }, [selectedBatchId, selectedStoreId])

  useEffect(() => {
    if (!selectedStoreId || !selectedBatchId) {
      setSelectedQueueItemId('')
      return
    }

    const batchItems = allItems
      .filter((item) => item.storeId === selectedStoreId && item.batchId === selectedBatchId)
      .filter((item) => queueFilter === 'all' ? true : (item.listingStatus || 'new') === queueFilter)
    const nextSelected = batchItems.find((item) => item.id === selectedQueueItemId) || batchItems[0] || null
    setSelectedQueueItemId(nextSelected?.id || '')
  }, [allItems, queueFilter, selectedBatchId, selectedQueueItemId, selectedStoreId])

  const ensureCurrentItem = useCallback(async () => {
    if (currentItem) {
      return currentItem
    }
    if (!selectedStoreId || !selectedBatchId) {
      return null
    }

    const draft = await itemPacketStore.createItem(selectedStoreId, selectedBatchId)
    setCurrentItem(draft)
    setItemSku('')
    setItemNote('')
    setItemWeight('')
    setItemDimensions('')
    return draft
  }, [currentItem, selectedBatchId, selectedStoreId])

  useEffect(() => {
    if (mobileMode !== 'camera' || currentItem || !selectedStoreId || !selectedBatchId) {
      return
    }

    ensureCurrentItem().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Draft creation failed: ${msg}`])
    })
  }, [currentItem, ensureCurrentItem, mobileMode, selectedBatchId, selectedStoreId])

  const handleOpenCamera = useCallback(async () => {
    try {
      await ensureCurrentItem()
      setMetadataOverlayOpen(false)
      setCameraSettingsOpen(false)
      setCameraTestOpen(false)
      setMobileMode('camera')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Open camera failed: ${msg}`])
    }
  }, [ensureCurrentItem])

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing || !selectedStoreId || !selectedBatchId) return
    setCapturing(true)
    setStatusMsg('Capturing…')

    try {
      const item = await ensureCurrentItem()
      if (!item) {
        throw new Error('No active item available')
      }

      const frame = await cameraRef.current.captureFrame()
      const processed = await imageProcessor.process(frame.blob, frame.capturedAt, selectedRatio, frame.width, frame.height)
      const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      const photoRecord = {
        id,
        uploadStatus: 'local' as const,
        remoteStatus: 'not_uploaded' as const,
        blob: processed.blob,
        mimeType: processed.mimeType,
        size: processed.size,
        capturedAt: processed.capturedAt,
        sourceWidth: processed.sourceWidth,
        sourceHeight: processed.sourceHeight,
        outputWidth: processed.outputWidth,
        outputHeight: processed.outputHeight,
        originalBlob: frame.blob,
        originalMimeType: frame.diagnostics?.originalMimeType || frame.blob.type,
        originalSize: frame.blob.size,
        originalWidth: frame.width,
        originalHeight: frame.height,
        thumbnailBlob: processed.thumbnailBlob,
        thumbnailSize: processed.thumbnailSize,
        thumbnailWidth: processed.thumbnailWidth,
        thumbnailHeight: processed.thumbnailHeight,
        ratio: processed.ratio,
      }

      const stored = await photoStore.save(photoRecord)

      await itemPacketStore.addItemPhoto(item.id, id)
      const itemWithMetadata = {
        ...item,
        photoIds: [...item.photoIds, id],
        updatedAt: new Date().toISOString(),
      }
      setCurrentItem(itemWithMetadata)
      await itemPacketStore.updateItemMetadata(item.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
        dimensions: itemDimensions || undefined,
      })

      if (frame.diagnostics) {
        setLastCaptureDiagnostics({
          ...frame.diagnostics,
          captureMethod: frame.diagnostics.captureMethod,
          processedWidth: processed.outputWidth,
          processedHeight: processed.outputHeight,
          processedByteSize: processed.size,
          selectedRatio,
        })
      }

      setAllPhotos((prev) => [...prev, stored])
      await loadData()
      setStatusMsg(`Captured ${frame.width}x${frame.height} for Item ${itemWithMetadata.itemNumber}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCaptureErrors((prev) => [...prev, `Capture failed: ${msg}`])
      setStatusMsg('Capture failed')
    } finally {
      setCapturing(false)
    }
  }, [capturing, ensureCurrentItem, itemDimensions, itemNote, itemSku, itemWeight, loadData, selectedBatchId, selectedRatio, selectedStoreId])

  const handleRatioChange = useCallback((ratio: OutputRatio) => {
    setSelectedRatio(ratio)
    saveDefaultRatioToStorage(ratio)
  }, [])

  const handleStoreChange = useCallback(async (storeId: string) => {
    const store = stores.find((entry) => entry.id === storeId) || (await workflowStore.ensureDefaultStore())
    const batchesForStore = await workflowStore.getBatches(store.id)
    const batch = batchesForStore.find((entry) => entry.status === 'active') || (await workflowStore.ensureDefaultBatch(store.id))
    setSelectedStoreId(store.id)
    setSelectedBatchId(batch.id)
    setBatches(batchesForStore.length > 0 ? batchesForStore : [batch])
  }, [stores])

  const handleCreateStore = useCallback(async () => {
    const name = window.prompt('Store name', 'New Store')
    if (!name?.trim()) return
    const shortCode = window.prompt('Short code', name.trim().slice(0, 3).toUpperCase()) || name.trim().slice(0, 3).toUpperCase()
    const store = await workflowStore.createStore(name.trim(), shortCode.trim() || 'NEW')
    const batch = await workflowStore.ensureDefaultBatch(store.id)
    await loadData()
    setSelectedStoreId(store.id)
    setSelectedBatchId(batch.id)
    setStatusMsg(`Created ${store.name}`)
  }, [loadData])

  const handleCreateBatch = useCallback(async () => {
    if (!selectedStoreId) return
    const name = window.prompt('Batch name', `Batch ${new Date().toLocaleDateString()}`)
    if (!name?.trim()) return
    const batch = await workflowStore.createBatch(selectedStoreId, name.trim())
    setSelectedBatchId(batch.id)
    await reloadBatches(selectedStoreId)
    setStatusMsg(`Created ${batch.name}`)
  }, [reloadBatches, selectedStoreId])

  const handleNextItem = useCallback(async () => {
    if (!currentItem || currentItem.photoIds.length === 0) return
    try {
      await itemPacketStore.updateItemMetadata(currentItem.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
        dimensions: itemDimensions || undefined,
      })
      await itemPacketStore.finalizeItem(currentItem.id)
      const next = await itemPacketStore.createItem(selectedStoreId, selectedBatchId)
      setCurrentItem(next)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      setItemDimensions('')
      await loadData()
      setStatusMsg(`Saved Item ${currentItem.itemNumber} and started Item ${next.itemNumber}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Next failed: ${msg}`])
    }
  }, [currentItem, itemDimensions, itemNote, itemSku, itemWeight, loadData, selectedBatchId, selectedStoreId])

  const handleDoneSession = useCallback(async () => {
    if (!currentItem) return

    try {
      await itemPacketStore.updateItemMetadata(currentItem.id, {
        sku: itemSku || undefined,
        note: itemNote || undefined,
        weight: itemWeight || undefined,
        dimensions: itemDimensions || undefined,
      })

      if (currentItem.photoIds.length > 0) {
        await itemPacketStore.finalizeItem(currentItem.id)
        setCurrentItem(null)
        setItemSku('')
        setItemNote('')
        setItemWeight('')
        setItemDimensions('')
      }

      await loadData()
      setStatusMsg('Capture session saved locally')
      setMobileMode('home')
      setMetadataOverlayOpen(false)
      setCameraSettingsOpen(false)
      setCameraSettingsPreviewQuality(false)
      setCameraTestOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Done failed: ${msg}`])
    }
  }, [currentItem, itemDimensions, itemNote, itemSku, itemWeight, loadData])

  const handleReset = useCallback(async () => {
    try {
      await photoStore.clearAll()
      await itemPacketStore.clearAll()
      const store = await workflowStore.ensureDefaultStore()
      const batch = await workflowStore.ensureDefaultBatch(store.id)
      await loadData()
      setSelectedStoreId(store.id)
      setSelectedBatchId(batch.id)
      setCurrentItem(null)
      setItemSku('')
      setItemNote('')
      setItemWeight('')
      setItemDimensions('')
      setMetadataOverlayOpen(false)
      setCameraSettingsOpen(false)
      setCameraSettingsPreviewQuality(false)
      setCameraTestOpen(false)
      setStatusMsg('Workspace data reset')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Reset failed: ${msg}`])
    }
  }, [loadData])

  const handleSendMagicLink = useCallback(async () => {
    try {
      setAuthMessage('')
      await sendMagicLink(authEmail)
      setAuthMessage(`Magic link sent to ${authEmail.trim()}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthMessage(`Auth failed: ${msg}`)
    }
  }, [authEmail, sendMagicLink])

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
      setAuthMessage('Signed out')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAuthMessage(`Sign out failed: ${msg}`)
    }
  }, [signOut])

  const handleSyncBatch = useCallback(async () => {
    if (!supabase || !session || uploading) {
      return
    }

    const store = stores.find((entry) => entry.id === selectedStoreId)
    const batch = batches.find((entry) => entry.id === selectedBatchId)

    if (!store || !batch) {
      setStorageErrors((prev) => [...prev, 'Sync failed: selected store or batch is missing'])
      return
    }

    setUploading(true)
    setUploadProgress({
      stage: 'idle',
      message: 'Preparing batch sync',
    })

    try {
      const result = await syncBatchToSupabase({
        client: supabase,
        store,
        batch,
        items: allItems,
        photos: allPhotos,
        itemStore: itemPacketStore,
        photoStore,
        bucket: SUPABASE_STORAGE_BUCKET,
        onProgress: setUploadProgress,
      })

      await loadData()
      setStatusMsg(`Synced ${result.uploadedItems} item${result.uploadedItems === 1 ? '' : 's'} to Supabase`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStorageErrors((prev) => [...prev, `Sync failed: ${msg}`])
      setUploadProgress({
        stage: 'error',
        message: `Sync failed: ${msg}`,
      })
    } finally {
      setUploading(false)
    }
  }, [allItems, allPhotos, batches, loadData, photoStore, selectedBatchId, selectedStoreId, session, stores, uploading])

  const handleClearVerifiedLocalCopies = useCallback(async () => {
    const report = getCleanupReport(allItems, allPhotos, selectedStoreId, selectedBatchId)

    if (report.blockedPhotos > 0 || report.eligiblePhotos === 0) {
      setCleanupMessage('Local cleanup is blocked until every photo in the batch is verified.')
      return
    }

    const verifiedPhotoIds = allPhotos
      .filter((photo) => photo.uploadStatus === 'verified' && photo.remoteStatus === 'verified')
      .filter((photo) => allItems.some((item) => item.storeId === selectedStoreId && item.batchId === selectedBatchId && item.photoIds.includes(photo.id)))
      .map((photo) => photo.id)

    try {
      for (const photoId of verifiedPhotoIds) {
        await photoStore.delete(photoId)
      }
      await loadData()
      setCleanupMessage(`Cleared ${verifiedPhotoIds.length} verified local photo${verifiedPhotoIds.length === 1 ? '' : 's'}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCleanupMessage(`Cleanup failed: ${msg}`)
    }
  }, [allItems, allPhotos, loadData, photoStore, selectedBatchId, selectedStoreId])

  const handleUpdateListingStatus = useCallback(async (item: ItemPacket, status: ListingStatus) => {
    const now = new Date().toISOString()
    const isListed = status === 'listed'
    const batch = batches.find((entry) => entry.id === selectedBatchId) || null
    const retentionMode = (batch?.remoteRetentionMode || 'delete_7d_after_listed') as RemoteRetentionMode
    const retentionWindow = isListed ? calculateRetentionWindow(now, retentionMode) : { eligibleAt: null, expiresAt: null }

    await itemPacketStore.updateItem(item.id, {
      listingStatus: status,
      listedAt: isListed ? now : undefined,
      remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
      remoteExpiresAt: retentionWindow.expiresAt || undefined,
      remoteDeletedAt: isListed ? undefined : item.remoteDeletedAt,
    })

    for (const photoId of item.photoIds) {
      await photoStore.updatePhoto(photoId, {
        remoteDeleteEligibleAt: retentionWindow.eligibleAt || undefined,
        remoteExpiresAt: retentionWindow.expiresAt || undefined,
      }).catch(() => undefined)
    }

    if (session && supabase && item.remoteId) {
      const { error } = await supabase
        .from('items')
        .update({
          status,
          listed_at: isListed ? now : null,
          photo_retention_until: retentionWindow.expiresAt || null,
        })
        .eq('id', item.remoteId)

      if (error) {
        setStorageErrors((prev) => [...prev, `Remote item update failed: ${error.message}`])
      }
    }

    await loadData()
  }, [batches, loadData, photoStore, selectedBatchId, session, supabase])

  const handleRemoteCleanup = useCallback(async () => {
    const batch = batches.find((entry) => entry.id === selectedBatchId) || null
    if (!batch || !supabase || remoteCleaning) {
      return
    }

    setRemoteCleaning(true)
    setRemoteCleanupProgress({
      stage: 'collecting',
      message: 'Checking remote cleanup eligibility',
    })

    try {
      const result = await deleteEligibleRemotePhotos({
        client: supabase,
        batch,
        items: allItems,
        photos: allPhotos,
        itemStore: itemPacketStore,
        photoStore,
        onProgress: setRemoteCleanupProgress,
      })

      await loadData()
      setCleanupMessage(`Deleted ${result.deletedPhotos} remote photo${result.deletedPhotos === 1 ? '' : 's'}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCleanupMessage(`Remote cleanup failed: ${msg}`)
      setRemoteCleanupProgress({
        stage: 'error',
        message: `Remote cleanup failed: ${msg}`,
      })
    } finally {
      setRemoteCleaning(false)
    }
  }, [allItems, allPhotos, batches, loadData, photoStore, remoteCleaning, selectedBatchId, supabase])

  const handleCopyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setStatusMsg(`${label} copied`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatusMsg(`Copy failed: ${msg}`)
    }
  }, [])

  const getCameraTestLogContext = useCallback(() => {
    const videoState = cameraRef.current?.getVideoState() ?? null
    const activeTrack = cameraRef.current?.getActiveTrack() ?? null

    return {
      videoState,
      trackState: activeTrack
        ? {
            readyState: activeTrack.readyState,
            muted: activeTrack.muted,
            enabled: activeTrack.enabled,
            label: activeTrack.label,
          }
        : null,
      settings: capabilities?.trackSettings ?? null,
      ratio: cameraTestOpen ? cameraTestPreviewRatio : selectedRatio,
    }
  }, [cameraRef, cameraTestOpen, cameraTestPreviewRatio, capabilities?.trackSettings, selectedRatio])

  const appendCameraTestLog = useCallback((entry: string) => {
    setCameraTestLogEntries((prev) => [...prev.slice(-59), entry])
  }, [])

  const handleCopyCameraTestLog = useCallback(() => {
    void handleCopyText(buildCameraTestLogText(cameraTestLogEntries), 'Camera logs')
  }, [cameraTestLogEntries, handleCopyText])

  const handleClearCameraTestLog = useCallback(() => {
    setCameraTestLogEntries([])
    setCameraTestMessage('Camera logs cleared.')
    setCameraTestError('')
  }, [])

  const handleRunCameraProbe = useCallback(async () => {
    const track = cameraRef.current?.getActiveTrack() ?? null
    setCameraTestMessage('Running capability probe…')
    setCameraTestError('')
    const beforeContext = getCameraTestLogContext()
    appendCameraTestLog(formatCameraTestLogEntry({
      action: 'probe',
      outcome: 'ok',
      ratio: beforeContext.ratio,
      videoState: beforeContext.videoState,
      trackState: beforeContext.trackState,
      beforeSettings: beforeContext.settings,
      afterSettings: beforeContext.settings,
      note: 'probe started',
    }))
    try {
      const result = await runCameraProbe(track)
      const summary = summarizeProbeForLog(result)
      const afterContext = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'probe',
        outcome: 'ok',
        ratio: afterContext.ratio,
        videoState: afterContext.videoState,
        trackState: afterContext.trackState,
        beforeSettings: beforeContext.settings,
        afterSettings: afterContext.settings,
        note: summary,
      }))
      setCameraTestMessage('Probe complete — summary added to camera logs.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraTestError(msg)
      setCameraTestMessage('Probe failed.')
      const context = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'probe',
        outcome: 'failed',
        ratio: context.ratio,
        videoState: context.videoState,
        trackState: context.trackState,
        beforeSettings: context.settings,
        afterSettings: context.settings,
        error: msg,
      }))
    }
  }, [appendCameraTestLog, cameraRef, getCameraTestLogContext])

  const handleCameraStarted = useCallback(() => {
    setCameraState('active')
    setCameraPermissionRemembered(true)
    saveCameraPermissionGranted(true)
    restorePreferredZoomPendingRef.current = true

    void refreshCameraTestState()

    setStatusMsg('Camera active')
  }, [refreshCameraTestState])

  const handleCameraError = useCallback((msg: string) => {
    setCameraState('error')
    setCaptureErrors((prev) => [...prev, msg])

    if (/permission|denied|notallowed/i.test(msg)) {
      setCameraPermissionRemembered(false)
      saveCameraPermissionGranted(false)
    }
  }, [])

  const applyCameraConstraint = useCallback(async (constraint: CameraTestConstraintSet) => {
    if (!cameraRef.current) {
      throw new Error('Camera not started')
    }

    await cameraRef.current.applyTestConstraints(constraint)
    return refreshCameraTestState()
  }, [refreshCameraTestState])

  const switchCameraDevice = useCallback(async (deviceId: string) => {
    if (!cameraRef.current) {
      throw new Error('Camera not started')
    }

    await cameraRef.current.switchCameraDevice(deviceId)
    return refreshCameraTestState()
  }, [refreshCameraTestState])

  const handleOpenCameraTest = useCallback(() => {
    setCameraTestError('')
    setCameraTestMessage('Temporary controls are open.')
    setMetadataOverlayOpen(false)
    setCameraSettingsOpen(false)
    setCameraTestPreviewRatio(selectedRatio)
    setCameraTestOpen(true)
    const context = getCameraTestLogContext()
    appendCameraTestLog(formatCameraTestLogEntry({
      action: 'open-test',
      outcome: 'ok',
      ratio: context.ratio,
      videoState: context.videoState,
      trackState: context.trackState,
      beforeSettings: context.settings,
      afterSettings: context.settings,
      note: 'test controls opened',
    }))
    void refreshCameraTestState()
  }, [appendCameraTestLog, getCameraTestLogContext, refreshCameraTestState, selectedRatio])

  const handleCloseCameraTest = useCallback(() => {
    setCameraTestOpen(false)
    setCameraTestError('')
    setCameraTestMessage('Camera Test closed.')
    const context = getCameraTestLogContext()
    appendCameraTestLog(formatCameraTestLogEntry({
      action: 'close-test',
      outcome: 'ok',
      ratio: context.ratio,
      videoState: context.videoState,
      trackState: context.trackState,
      beforeSettings: context.settings,
      afterSettings: context.settings,
    }))
  }, [appendCameraTestLog, getCameraTestLogContext])

  const handleOpenCameraSettings = useCallback(() => {
    setCameraSettingsError('')
    setCameraSettingsMessage('Camera settings open.')
    setMetadataOverlayOpen(false)
    setCameraTestOpen(false)
    setCameraSettingsOpen(true)
  }, [])

  const handleCloseCameraSettings = useCallback(() => {
    setCameraSettingsOpen(false)
    setCameraSettingsError('')
    setCameraSettingsMessage('Camera settings closed.')
  }, [])

  const handleToggleCameraSettingsPreviewQuality = useCallback(() => {
    setCameraSettingsPreviewQuality((enabled) => {
      const next = !enabled
      setCameraSettingsMessage(next ? 'Full-quality preview test enabled.' : 'Standard preview restored.')
      return next
    })
    setCameraSettingsError('')
  }, [])

  const handleApplyCameraTestConstraint = useCallback(async (constraint: CameraTestConstraintSet) => {
    if (!cameraRef.current) {
      setCameraTestError('Camera not started')
      setCameraTestMessage('Camera setting failed.')
      const context = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'apply-constraint',
        outcome: 'failed',
        ratio: context.ratio,
        requested: JSON.stringify(constraint),
        videoState: context.videoState,
        trackState: context.trackState,
        beforeSettings: context.settings,
        afterSettings: context.settings,
        error: 'Camera not started',
      }))
      return
    }

    try {
      setCameraTestError('')
      const supportedKeys = new Set(['zoom', 'torch', 'whiteBalanceMode', 'focusDistance', 'pointsOfInterest', 'focusMode'])
      const constraintKeys = Object.keys(constraint).filter((key) => constraint[key as keyof CameraTestConstraintSet] !== undefined)
      const unsupportedKeys = constraintKeys.filter((key) => !supportedKeys.has(key) && key !== 'aspectRatio')

      if (unsupportedKeys.length > 0) {
        const context = getCameraTestLogContext()
        const msg = `Unsupported test control(s): ${unsupportedKeys.join(', ')}`
        setCameraTestError(msg)
        setCameraTestMessage('Camera setting failed.')
        appendCameraTestLog(formatCameraTestLogEntry({
          action: 'apply-constraint',
          outcome: 'skipped',
          ratio: context.ratio,
          requested: JSON.stringify(constraint),
          videoState: context.videoState,
          trackState: context.trackState,
          beforeSettings: context.settings,
          afterSettings: context.settings,
          note: msg,
        }))
        return
      }

      if ('aspectRatio' in constraint && constraint.aspectRatio !== undefined) {
        const beforeContext = getCameraTestLogContext()
        appendCameraTestLog(formatCameraTestLogEntry({
          action: 'ratio-preview',
          outcome: 'ok',
          ratio: constraint.aspectRatio === 1 ? '1:1' : 'full',
          requested: JSON.stringify(constraint),
          videoState: beforeContext.videoState,
          trackState: beforeContext.trackState,
          beforeSettings: beforeContext.settings,
          afterSettings: beforeContext.settings,
          note: 'preview-only; no stream constraint applied',
        }))
        setCameraTestMessage('Aspect ratio preview only.')
        return
      }

      const beforeContext = getCameraTestLogContext()
      const refreshed = await applyCameraConstraint(constraint)
      const afterContext = {
        ...getCameraTestLogContext(),
        settings: refreshed?.trackSettings ?? cameraRef.current.getCapabilities()?.trackSettings ?? null,
      }
      const action = typeof constraint.zoom === 'number'
        ? 'zoom'
        : typeof constraint.torch === 'boolean'
          ? 'torch'
          : typeof constraint.whiteBalanceMode === 'string'
            ? 'whiteBalance'
          : typeof constraint.focusDistance === 'number'
              ? 'focusDistance'
              : constraint.pointsOfInterest
                ? 'focusTap'
                : typeof constraint.focusMode === 'string'
                  ? 'focusMode'
              : 'apply-constraint'

      if (typeof constraint.torch === 'boolean') {
        const verified = refreshed?.trackSettings?.torch === constraint.torch
        if (!verified) {
          const msg = `Torch request ignored by browser (requested ${constraint.torch ? 'on' : 'off'}, got ${String(refreshed?.trackSettings?.torch ?? '?')})`
          setCameraTestError(msg)
          setCameraTestMessage('Camera setting failed.')
          appendCameraTestLog(formatCameraTestLogEntry({
            action,
            outcome: 'failed',
            ratio: afterContext.ratio,
            requested: JSON.stringify(constraint),
            videoState: afterContext.videoState,
            trackState: afterContext.trackState,
            beforeSettings: beforeContext.settings,
            afterSettings: afterContext.settings,
            error: msg,
          }))
          return
        }
      }

      if (typeof constraint.zoom === 'number' && refreshed?.trackSettings?.zoom !== constraint.zoom) {
        const msg = `Zoom request not reflected in getSettings (requested ${constraint.zoom}, got ${refreshed?.trackSettings?.zoom ?? '?'})`
        setCameraTestError(msg)
        setCameraTestMessage('Camera setting failed.')
        appendCameraTestLog(formatCameraTestLogEntry({
          action,
          outcome: 'failed',
          ratio: afterContext.ratio,
          requested: JSON.stringify(constraint),
          videoState: afterContext.videoState,
          trackState: afterContext.trackState,
          beforeSettings: beforeContext.settings,
          afterSettings: afterContext.settings,
          error: msg,
        }))
        return
      }

      if (typeof constraint.whiteBalanceMode === 'string' && refreshed?.trackSettings?.whiteBalanceMode !== constraint.whiteBalanceMode) {
        const msg = `White balance request not reflected in getSettings (requested ${constraint.whiteBalanceMode}, got ${refreshed?.trackSettings?.whiteBalanceMode ?? '?'})`
        setCameraTestError(msg)
        setCameraTestMessage('Camera setting failed.')
        appendCameraTestLog(formatCameraTestLogEntry({
          action,
          outcome: 'failed',
          ratio: afterContext.ratio,
          requested: JSON.stringify(constraint),
          videoState: afterContext.videoState,
          trackState: afterContext.trackState,
          beforeSettings: beforeContext.settings,
          afterSettings: afterContext.settings,
          error: msg,
        }))
        return
      }

      const zoomValue = typeof constraint.zoom === 'number' ? constraint.zoom : undefined
      if (zoomValue !== undefined && refreshed?.trackSettings?.zoom === zoomValue) {
        setPreferredZoom(zoomValue)
        saveCameraPreferences({ preferredZoom: zoomValue })
      }

      setCameraTestMessage('Applied camera test setting.')
      appendCameraTestLog(formatCameraTestLogEntry({
        action,
        outcome: 'ok',
        ratio: afterContext.ratio,
        requested: JSON.stringify(constraint),
        videoState: afterContext.videoState,
        trackState: afterContext.trackState,
        beforeSettings: beforeContext.settings,
        afterSettings: afterContext.settings,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraTestError(msg)
      setCameraTestMessage('Camera setting failed.')
      const context = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'apply-constraint',
        outcome: 'failed',
        ratio: context.ratio,
        requested: JSON.stringify(constraint),
        videoState: context.videoState,
        trackState: context.trackState,
        beforeSettings: context.settings,
        afterSettings: context.settings,
        error: msg,
      }))
    }
  }, [appendCameraTestLog, applyCameraConstraint, getCameraTestLogContext, saveCameraPreferences])

  const handleApplyCameraSettingConstraint = useCallback(async (constraint: CameraTestConstraintSet) => {
    if (!cameraRef.current) {
      setCameraSettingsError('Camera not started')
      setCameraSettingsMessage('Camera setting failed.')
      return
    }

    try {
      setCameraSettingsError('')
      const refreshed = await applyCameraConstraint(constraint)
      const afterSettings = refreshed?.trackSettings ?? cameraRef.current.getCapabilities()?.trackSettings ?? null

      if (typeof constraint.torch === 'boolean' && afterSettings?.torch !== constraint.torch) {
        const msg = `Torch request ignored by browser (requested ${constraint.torch ? 'on' : 'off'}, got ${String(afterSettings?.torch ?? '?')})`
        setCameraSettingsError(msg)
        setCameraSettingsMessage('Camera setting failed.')
        return
      }

      if (typeof constraint.zoom === 'number' && afterSettings?.zoom !== constraint.zoom) {
        const msg = `Zoom request not reflected in getSettings (requested ${constraint.zoom}, got ${afterSettings?.zoom ?? '?'})`
        setCameraSettingsError(msg)
        setCameraSettingsMessage('Camera setting failed.')
        return
      }

      if (typeof constraint.whiteBalanceMode === 'string' && afterSettings?.whiteBalanceMode !== constraint.whiteBalanceMode) {
        const msg = `White balance request not reflected in getSettings (requested ${constraint.whiteBalanceMode}, got ${afterSettings?.whiteBalanceMode ?? '?'})`
        setCameraSettingsError(msg)
        setCameraSettingsMessage('Camera setting failed.')
        return
      }

      if (typeof constraint.focusDistance === 'number' && afterSettings?.focusDistance !== constraint.focusDistance) {
        const msg = `Focus distance request not reflected in getSettings (requested ${constraint.focusDistance}, got ${afterSettings?.focusDistance ?? '?'})`
        setCameraSettingsError(msg)
        setCameraSettingsMessage('Camera setting failed.')
        return
      }

      const zoomValue = typeof constraint.zoom === 'number' ? constraint.zoom : undefined
      if (zoomValue !== undefined && afterSettings?.zoom === zoomValue) {
        setPreferredZoom(zoomValue)
        saveCameraPreferences({ preferredZoom: zoomValue })
      }

      setCameraSettingsMessage('Applied camera setting.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraSettingsError(msg)
      setCameraSettingsMessage('Camera setting failed.')
    }
  }, [applyCameraConstraint, cameraRef])

  const handleSelectCameraDevice = useCallback(async (deviceId: string) => {
    if (!cameraRef.current) {
      setCameraTestError('Camera not started')
      setCameraTestMessage('Device switch failed.')
      const context = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'device-switch',
        outcome: 'failed',
        ratio: context.ratio,
        requested: deviceId,
        videoState: context.videoState,
        trackState: context.trackState,
        beforeSettings: context.settings,
        afterSettings: context.settings,
        error: 'Camera not started',
      }))
      return
    }

    try {
      setCameraTestError('')
      setCameraTestMessage('Switching camera device…')
      const beforeContext = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'device-switch',
        outcome: 'ok',
        ratio: beforeContext.ratio,
        requested: deviceId,
        videoState: beforeContext.videoState,
        trackState: beforeContext.trackState,
        beforeSettings: beforeContext.settings,
        afterSettings: beforeContext.settings,
        note: 'switch requested',
      }))
      const refreshed = await switchCameraDevice(deviceId)
      setCameraTestMessage('Camera device switched.')
      const afterContext = {
        ...getCameraTestLogContext(),
        settings: refreshed?.trackSettings ?? cameraRef.current.getCapabilities()?.trackSettings ?? null,
      }
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'device-switch',
        outcome: 'ok',
        ratio: afterContext.ratio,
        requested: deviceId,
        videoState: afterContext.videoState,
        trackState: afterContext.trackState,
        beforeSettings: beforeContext.settings,
        afterSettings: afterContext.settings,
        note: 'switch complete',
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraTestError(msg)
      setCameraTestMessage('Device switch failed.')
      const context = getCameraTestLogContext()
      appendCameraTestLog(formatCameraTestLogEntry({
        action: 'device-switch',
        outcome: 'failed',
        ratio: context.ratio,
        requested: deviceId,
        videoState: context.videoState,
        trackState: context.trackState,
        beforeSettings: context.settings,
        afterSettings: context.settings,
        error: msg,
      }))
    }
  }, [appendCameraTestLog, getCameraTestLogContext, switchCameraDevice])

  const handleApplyLensPreset = useCallback(async (preset: number) => {
    if (!cameraRef.current) {
      throw new Error('Camera not started')
    }

    const currentDeviceId = capabilities?.trackSettings?.deviceId
    const mainDevice = pickMainRearDevice(cameraDevices)
    const inferredDevice =
      preset <= 0.75
        ? pickUltraWideRearDevice(cameraDevices, mainDevice?.deviceId)
        : mainDevice
    const targetDevice = inferredDevice || pickCameraDeviceForZoomPreset(cameraDevices, preset, currentDeviceId)

    if (!targetDevice) {
      setStatusMsg(`Lens ${formatLensPresetLabel(preset)} unavailable on this device.`)
      return
    }

    if (targetDevice && targetDevice.deviceId !== currentDeviceId) {
      await handleSelectCameraDevice(targetDevice.deviceId)
    }

    setPreferredZoom(preset)
    saveCameraPreferences({ preferredZoom: preset })
    setStatusMsg(`Lens ${formatLensPresetLabel(preset)} selected: ${formatCameraDeviceLabel(targetDevice.label || targetDevice.deviceId)}`)
  }, [cameraDevices, capabilities?.trackSettings?.deviceId, handleSelectCameraDevice, saveCameraPreferences])

  useEffect(() => {
    if (cameraState !== 'active' || !restorePreferredZoomPendingRef.current || !cameraRef.current) {
      return
    }

    const supportedLensChoices = getAvailableLensPresets(cameraDevices)
    if (supportedLensChoices.length === 0) {
      return
    }

    const lensToRestore =
      supportedLensChoices.some((preset) => isPresetActive(preferredZoom, preset))
        ? preferredZoom
        : supportedLensChoices.some((preset) => isPresetActive(1, preset))
          ? 1
          : supportedLensChoices[0]

    restorePreferredZoomPendingRef.current = false
    void handleApplyLensPreset(lensToRestore)
  }, [cameraDevices, cameraState, handleApplyLensPreset, preferredZoom])

  const handleChangeCameraTestPreviewRatio = useCallback((ratio: OutputRatio) => {
    setCameraTestPreviewRatio(ratio)
    const context = getCameraTestLogContext()
    appendCameraTestLog(formatCameraTestLogEntry({
      action: 'ratio-preview',
      outcome: 'ok',
      ratio,
      videoState: context.videoState,
      trackState: context.trackState,
      beforeSettings: context.settings,
      afterSettings: context.settings,
      note: 'preview-only; no stream restart',
    }))
  }, [appendCameraTestLog, getCameraTestLogContext])

  const canTapToFocus = useMemo(() => {
    const raw = capabilities?.raw as ExtendedMediaTrackCapabilities | null
    return Boolean(raw?.pointsOfInterest?.length)
  }, [capabilities])

  const canPinchToZoom = useMemo(() => {
    return false
  }, [])

  const getPreviewPoint = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    return { x, y }
  }, [])

  const applyTapFocusPoint = useCallback((x: number, y: number) => {
    const focusMode = (capabilities?.raw as ExtendedMediaTrackCapabilities | null)?.focusMode?.[0] || 'single-shot'
    void handleApplyCameraTestConstraint({
      pointsOfInterest: { x, y },
      focusMode,
    }).catch(() => undefined)

    const focusMessage = `Tap focus at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%.`
    if (cameraTestOpen) {
      setCameraTestMessage(focusMessage)
    } else {
      setStatusMsg(focusMessage)
    }
  }, [cameraTestOpen, capabilities?.raw, handleApplyCameraTestConstraint])

  const handlePreviewClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canTapToFocus) {
      return
    }
    if (event.button !== 0) {
      return
    }

    const { x, y } = getPreviewPoint(event)
    applyTapFocusPoint(x, y)
  }, [applyTapFocusPoint, canTapToFocus, getPreviewPoint])

  const handlePreviewTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!canPinchToZoom) {
      return
    }
    if (event.touches.length !== 2) {
      return
    }

    const raw = capabilities?.raw as ExtendedMediaTrackCapabilities | null
    const zoomCap = raw?.zoom
    if (!zoomCap) {
      return
    }

    const [a, b] = [event.touches[0], event.touches[1]]
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    pinchStartDistanceRef.current = Math.max(1, Math.hypot(dx, dy))
    pinchStartZoomRef.current = preferredZoom ?? zoomCap.min ?? 1
    pinchLastAppliedZoomRef.current = pinchStartZoomRef.current
  }, [canPinchToZoom, capabilities, preferredZoom])

  const handlePreviewTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!canPinchToZoom) {
      return
    }
    if (event.touches.length !== 2 || pinchApplyingRef.current) {
      return
    }

    const raw = capabilities?.raw as ExtendedMediaTrackCapabilities | null
    const zoomCap = raw?.zoom
    if (!zoomCap || pinchStartDistanceRef.current === null || pinchStartZoomRef.current === null) {
      return
    }

    event.preventDefault()

    const [a, b] = [event.touches[0], event.touches[1]]
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    const distance = Math.max(1, Math.hypot(dx, dy))
    const ratio = distance / pinchStartDistanceRef.current
    const nextZoom = Math.min(zoomCap.max, Math.max(zoomCap.min, pinchStartZoomRef.current * ratio))
    const nextPreset = nextZoom <= 0.75 ? 0.5 : 1

    if (pinchLastAppliedZoomRef.current !== null && Math.abs(nextPreset - pinchLastAppliedZoomRef.current) < (zoomCap.step || 0.1) / 2) {
      return
    }

    pinchLastAppliedZoomRef.current = nextPreset
    pinchApplyingRef.current = true
    void handleApplyLensPreset(nextPreset)
      .catch(() => undefined)
      .finally(() => {
        pinchApplyingRef.current = false
      })
  }, [canPinchToZoom, capabilities, handleApplyLensPreset])

  const handlePreviewTouchEnd = useCallback(() => {
    pinchStartDistanceRef.current = null
    pinchStartZoomRef.current = null
    pinchLastAppliedZoomRef.current = null
  }, [])

  useEffect(() => {
    if (mobileMode !== 'camera' || !cameraTestOpen || cameraState !== 'active') {
      return
    }

    refreshCameraTestState().catch(() => undefined)
  }, [cameraState, cameraTestOpen, mobileMode, refreshCameraTestState])

  const queueItems = useMemo(() => {
    const items = allItems.filter((item) => item.storeId === selectedStoreId && item.batchId === selectedBatchId)
    const filtered = queueFilter === 'all' ? items : items.filter((item) => (item.listingStatus || 'new') === queueFilter)
    return sortItems(filtered, 'newest-first')
  }, [allItems, queueFilter, selectedBatchId, selectedStoreId])

  const batchUploadSummary = useMemo(() => {
    return getBatchUploadStateSummary(allItems, allPhotos, selectedStoreId, selectedBatchId)
  }, [allItems, allPhotos, selectedBatchId, selectedStoreId])

  const cleanupReport = useMemo(() => {
    return getCleanupReport(allItems, allPhotos, selectedStoreId, selectedBatchId)
  }, [allItems, allPhotos, selectedBatchId, selectedStoreId])

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId],
  )

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) || null,
    [selectedStoreId, stores],
  )

  const remoteCleanupReport = useMemo(() => {
    if (!selectedBatch) {
      return null
    }
    return getRemoteCleanupReport(allItems, allPhotos, selectedBatch, selectedStoreId, selectedBatchId)
  }, [allItems, allPhotos, selectedBatch, selectedBatchId, selectedStoreId])

  const selectedStoreBatches = useMemo(
    () => batches.filter((batch) => batch.storeId === selectedStoreId),
    [batches, selectedStoreId],
  )

  const desktopStoreCards = useMemo(() => {
    return stores.map((store) => {
      const storeBatches = batches.filter((batch) => batch.storeId === store.id)
      const storeItems = allItems.filter((item) => item.storeId === store.id)
      const storePhotos = allPhotos.filter((photo) => storeItems.some((item) => item.photoIds.includes(photo.id)))
      const activeBatchCount = storeBatches.filter((batch) => batch.status === 'active').length
      const unlistedCount = storeItems.filter((item) => (item.listingStatus || 'new') === 'new').length
      const needsRetakeCount = storeItems.filter((item) => item.listingStatus === 'needs_retake').length
      const incompleteUploadCount = storeItems.filter((item) => {
        const itemPhotos = item.photoIds.map((photoId) => allPhotos.find((photo) => photo.id === photoId)).filter((photo): photo is StoredPhoto => Boolean(photo))
        return itemPhotos.length > 0 && itemPhotos.some((photo) => photo.uploadStatus !== 'verified' || photo.remoteStatus !== 'verified')
      }).length

      return {
        store,
        activeBatchCount,
        batchCount: storeBatches.length,
        itemCount: storeItems.length,
        photoCount: storePhotos.length,
        unlistedCount,
        needsRetakeCount,
        incompleteUploadCount,
      }
    })
  }, [allItems, allPhotos, batches, stores])

  const desktopBatchCards = useMemo(() => {
    return selectedStoreBatches.map((batch) => {
      const batchItems = allItems.filter((item) => item.storeId === selectedStoreId && item.batchId === batch.id)
      const batchPhotos = allPhotos.filter((photo) => batchItems.some((item) => item.photoIds.includes(photo.id)))
      const uploadSummary = getBatchUploadStateSummary(allItems, allPhotos, selectedStoreId, batch.id)
      const readyCount = batchItems.filter((item) => getItemReadiness(item, allPhotos).readyForHandoff).length
      return {
        batch,
        itemCount: batchItems.length,
        photoCount: batchPhotos.length,
        readyCount,
        uploadSummary,
      }
    })
  }, [allItems, allPhotos, selectedBatchId, selectedStoreBatches, selectedStoreId])

  const selectedDesktopItem = useMemo(() => {
    if (!selectedQueueItemId) {
      return queueItems[0] || null
    }
    return queueItems.find((item) => item.id === selectedQueueItemId) || queueItems[0] || null
  }, [queueItems, selectedQueueItemId])

  const selectedDesktopItemPhotos = useMemo(() => {
    if (!selectedDesktopItem) return []
    return selectedDesktopItem.photoIds
      .map((photoId) => allPhotos.find((photo) => photo.id === photoId))
      .filter((photo): photo is StoredPhoto => Boolean(photo))
  }, [allPhotos, selectedDesktopItem])

  const selectedDesktopItemReadiness = useMemo(() => {
    if (!selectedDesktopItem) return null
    return getItemReadiness(selectedDesktopItem, allPhotos)
  }, [allPhotos, selectedDesktopItem])

  const currentItemPhotos = useMemo(() => {
    if (!currentItem) return []
    return allPhotos.filter((photo) => currentItem.photoIds.includes(photo.id))
  }, [allPhotos, currentItem])

  const currentItemReadiness = useMemo(() => {
    if (!currentItem) return null
    return getItemReadiness(currentItem, allPhotos)
  }, [allPhotos, currentItem])

  if (isMobile) {
    return (
      <MobileWorkspace
        mobileMode={mobileMode}
        selectedStore={selectedStore}
        selectedBatch={selectedBatch}
        batchUploadSummary={batchUploadSummary}
        cameraPermissionRemembered={cameraPermissionRemembered}
        cameraState={cameraState}
        capabilities={capabilities}
        cameraSettingsPreviewQuality={cameraSettingsPreviewQuality}
        cameraSettingsOpen={cameraSettingsOpen}
        cameraSettingsMessage={cameraSettingsMessage}
        cameraSettingsError={cameraSettingsError}
        cameraTestOpen={cameraTestOpen}
        cameraDevices={cameraDevices}
        cameraTestMessage={cameraTestMessage}
        cameraTestError={cameraTestError}
        currentItem={currentItem}
        currentItemReadiness={currentItemReadiness}
        supabaseReady={supabaseReady}
        session={session}
        authLoading={authLoading}
        cameraPreviewRatio={cameraTestOpen ? cameraTestPreviewRatio : cameraSettingsPreviewQuality ? 'full' : selectedRatio}
        selectedRatio={selectedRatio}
        preferredZoom={preferredZoom}
        cameraRef={cameraRef}
        handleCameraError={handleCameraError}
        handleCameraStarted={handleCameraStarted}
        setCameraState={setCameraState}
        handleRatioChange={handleRatioChange}
        handlePreviewClick={handlePreviewClick}
        handlePreviewTouchStart={handlePreviewTouchStart}
        handlePreviewTouchMove={handlePreviewTouchMove}
        handlePreviewTouchEnd={handlePreviewTouchEnd}
        handleOpenCameraSettings={handleOpenCameraSettings}
        handleCloseCameraSettings={handleCloseCameraSettings}
        handleToggleCameraSettingsPreviewQuality={handleToggleCameraSettingsPreviewQuality}
        handleApplyCameraSettingConstraint={handleApplyCameraSettingConstraint}
        handleApplyLensPreset={handleApplyLensPreset}
        handleOpenCameraTest={handleOpenCameraTest}
        handleCloseCameraTest={handleCloseCameraTest}
        handleSelectCameraDevice={handleSelectCameraDevice}
        handleApplyCameraTestConstraint={handleApplyCameraTestConstraint}
        handleChangeCameraTestPreviewRatio={handleChangeCameraTestPreviewRatio}
        cameraTestLogText={buildCameraTestLogText(cameraTestLogEntries)}
        handleCopyCameraTestLog={handleCopyCameraTestLog}
        handleClearCameraTestLog={handleClearCameraTestLog}
        handleRunCameraProbe={handleRunCameraProbe}
        capturing={capturing}
        selectedStoreId={selectedStoreId}
        selectedBatchId={selectedBatchId}
        handleCapture={handleCapture}
        statusMsg={statusMsg}
        handleNextItem={handleNextItem}
        handleDoneSession={handleDoneSession}
        itemSku={itemSku}
        itemWeight={itemWeight}
        itemDimensions={itemDimensions}
        setItemSku={setItemSku}
        setItemWeight={setItemWeight}
        setItemDimensions={setItemDimensions}
        metadataOverlayOpen={metadataOverlayOpen}
        setMetadataOverlayOpen={setMetadataOverlayOpen}
        handleOpenCamera={handleOpenCamera}
        handleSyncBatch={handleSyncBatch}
        setMobileMode={setMobileMode}
      />
    )
  }

  return (
    <div style={s.desktopScreen}>
      <div style={s.desktopFrame}>
        <div style={s.desktopTopBar}>
          <div style={s.desktopTitleBlock}>
            <div style={s.desktopTitle}>Management</div>
            <div style={s.desktopSubtitle}>
              {APP_NAME} management for review, listing status, retention, and cleanup.
            </div>
          </div>
          <div style={s.desktopTabs}>
            {([
              ['queue', 'Queue'],
              ['tools', 'Tools'],
              ['capture', 'Capture'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                style={{
                  ...s.desktopTab,
                  ...(desktopMode === mode ? s.desktopTabActive : {}),
                }}
                onClick={() => setDesktopMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <WorkspaceStatusStrip
          cameraState={cameraState}
          cameraPermissionRemembered={cameraPermissionRemembered}
          authLoading={authLoading}
          authError={authError}
          supabaseReady={supabaseReady}
          session={session}
          uploading={uploading}
          uploadProgress={uploadProgress}
          batchUploadSummary={batchUploadSummary}
          cleanupReport={cleanupReport}
          remoteCleanupReport={remoteCleanupReport}
          remoteCleaning={remoteCleaning}
          selectedStore={selectedStore}
          selectedBatch={selectedBatch}
        />

        <div style={s.desktopContext}>
          <div style={s.desktopContextCard}>
            <div style={s.desktopContextTitle}>Context</div>
            <div style={s.desktopContextBody}>
              <div>
                <div style={s.label}>Store</div>
                <select style={s.select} value={selectedStoreId} onChange={(e) => handleStoreChange(e.target.value)}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name} ({store.shortCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={s.label}>Batch</div>
                <select style={s.select} value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)}>
                  {selectedStoreBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {desktopMode === 'capture' && (
          <div style={s.desktopGrid}>
            <div style={{ ...s.desktopPanel, minHeight: 0 }}>
              <div style={s.desktopPanelHead}>
                <div>
                  <div style={s.desktopPanelTitle}>Capture</div>
                  <div style={s.desktopPanelMeta}>Optional quick capture for the current store and batch.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ ...s.button, ...s.buttonDanger }} onClick={handleReset}>Reset</button>
                  <button
                    style={{ ...s.button, ...s.buttonPrimary }}
                    onClick={handleSyncBatch}
                    disabled={!supabaseReady || !session || uploading || !selectedStoreId || !selectedBatchId}
                  >
                    {uploading ? 'Syncing…' : 'Sync Batch'}
                  </button>
                </div>
              </div>
              <div style={{ ...s.desktopStack, gridTemplateRows: 'minmax(0, 1fr) auto' }}>
                <CameraPreview
                  ref={cameraRef}
                  onError={handleCameraError}
                  onStarted={handleCameraStarted}
                  onStopped={() => setCameraState('stopped')}
                  ratio={selectedRatio}
                />

                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#a8a8a8' }}>
                    <span>{selectedStore?.name || 'Store'} / {selectedBatch?.name || 'Batch'}</span>
                    {currentItem && <span>Item {currentItem.itemNumber} • {currentItem.photoIds.length} photo{currentItem.photoIds.length === 1 ? '' : 's'}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(['full', '1:1', '4:3', '16:9'] as OutputRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        style={{
                          ...s.button,
                          ...s.buttonSmall,
                          ...(selectedRatio === ratio ? s.buttonPrimary : {}),
                        }}
                        onClick={() => handleRatioChange(ratio)}
                      >
                        {ratio === 'full' ? 'Full' : ratio}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      style={{ ...s.button, ...s.buttonPrimary }}
                      disabled={capturing || cameraState !== 'active' || !selectedStoreId || !selectedBatchId}
                      onClick={handleCapture}
                    >
                      {capturing ? 'Capturing…' : '⊙ Capture'}
                    </button>
                    <button
                      style={s.button}
                      disabled={!currentItem || currentItem.photoIds.length === 0}
                      onClick={handleNextItem}
                    >
                      Next Item
                    </button>
                    <button
                      style={s.button}
                      onClick={handleDoneSession}
                    >
                      Done Session
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input style={s.select} placeholder="SKU (optional)" value={itemSku} onChange={(e) => setItemSku(e.target.value)} />
                    <input style={s.select} placeholder="Note (optional)" value={itemNote} onChange={(e) => setItemNote(e.target.value)} />
                    <input style={s.select} placeholder="Weight (optional)" value={itemWeight} onChange={(e) => setItemWeight(e.target.value)} />
                    <input style={s.select} placeholder="Dimensions (optional)" value={itemDimensions} onChange={(e) => setItemDimensions(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div style={s.desktopStack}>
              <div style={s.desktopPanel}>
                <div style={s.desktopPanelHead}>
                  <div>
                    <div style={s.desktopPanelTitle}>Status</div>
                    <div style={s.desktopPanelMeta}>{statusMsg}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleCreateStore}>New Store</button>
                    <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleCreateBatch} disabled={!selectedStoreId}>New Batch</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10, minHeight: 0 }}>
                  <PhotoList photos={currentItemPhotos} onPhotoClick={(photo) => setSelectedPhoto(photo)} />
                  <details>
                    <summary style={{ cursor: 'pointer', color: '#a8a8a8', fontSize: 13, fontWeight: 700 }}>
                      Diagnostics
                    </summary>
                    <div style={{ marginTop: 12 }}>
                      <DiagnosticsPanel
                        cameraState={cameraState}
                        capabilities={capabilities}
                        captureErrors={captureErrors}
                        storageErrors={storageErrors}
                        secureContext={secureContextInfo}
                        lastCaptureDiagnostics={lastCaptureDiagnostics}
                      />
                    </div>
                  </details>
                </div>
              </div>

              <div style={s.desktopPanel}>
                <div style={s.desktopPanelHead}>
                  <div>
                    <div style={s.desktopPanelTitle}>Control center</div>
                    <div style={s.desktopPanelMeta}>Auth, sync, cleanup, and diagnostics live here.</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 10, minHeight: 0 }}>
                  <div style={s.authLine}>
                    <span>Supabase auth</span>
                    <span>
                      {authLoading
                        ? 'loading session'
                        : session
                          ? `signed in as ${session.user.email || session.user.id}`
                          : 'signed out'}
                    </span>
                  </div>
                  {authError && <div style={{ fontSize: 12, color: '#f87171' }}>{authError}</div>}
                  {authMessage && <div style={{ fontSize: 12, color: '#93c5fd' }}>{authMessage}</div>}
                  {!supabaseReady ? (
                    <div style={{ fontSize: 12, color: '#f59e0b' }}>
                      Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable auth and upload.
                    </div>
                  ) : session ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSyncBatch} disabled={uploading}>
                        {uploading ? 'Syncing…' : 'Upload Batch'}
                      </button>
                      <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSignOut}>
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        style={s.select}
                        placeholder="Email for magic link"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        type="email"
                      />
                      <button
                        style={{ ...s.button, ...s.buttonPrimary }}
                        onClick={handleSendMagicLink}
                        disabled={!authEmail.trim()}
                      >
                        Send link
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      style={{ ...s.button, ...s.buttonSmall }}
                      onClick={handleSyncBatch}
                      disabled={!supabaseReady || !session || uploading || !selectedStoreId || !selectedBatchId}
                    >
                      {uploading ? 'Syncing…' : 'Retry upload'}
                    </button>
                    <button
                      style={{ ...s.button, ...s.buttonSmall }}
                      onClick={handleRemoteCleanup}
                      disabled={!supabase || !session || remoteCleaning || !selectedBatch || (remoteCleanupReport?.eligiblePhotos || 0) === 0}
                    >
                      {remoteCleaning ? 'Cleaning…' : 'Delete remote assets'}
                    </button>
                    <button
                      style={{ ...s.button, ...s.buttonSmall }}
                      onClick={handleClearVerifiedLocalCopies}
                      disabled={!cleanupReport.safeToClear}
                    >
                      Clear local copies
                    </button>
                  </div>

                  {uploadProgress && <div style={s.progressBox}>{uploadProgress.message}</div>}
                  {remoteCleanupProgress && <div style={s.progressBox}>{remoteCleanupProgress.message}</div>}
                  {cleanupMessage && <div style={s.progressBox}>{cleanupMessage}</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {desktopMode === 'queue' && (
          <div style={s.desktopGrid}>
            <div style={s.desktopPanel}>
              <div style={s.desktopPanelHead}>
                <div>
                  <div style={s.desktopPanelTitle}>Queue</div>
                  <div style={s.desktopPanelMeta}>Stores, batches, and item lists.</div>
                </div>
              </div>
              <div style={s.desktopScrollList}>
                <div style={s.label}>Stores</div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {desktopStoreCards.length === 0 ? (
                    <div style={s.empty}>No stores yet.</div>
                  ) : (
                    desktopStoreCards.map(({ store, activeBatchCount, batchCount, itemCount, photoCount, unlistedCount, needsRetakeCount, incompleteUploadCount }) => (
                      <button
                        key={store.id}
                        onClick={() => void handleStoreChange(store.id)}
                        style={{
                          ...s.queueItem,
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderColor: selectedStoreId === store.id ? '#60a5fa' : '#242424',
                          outline: 'none',
                        }}
                      >
                        <div style={{ ...s.queueContent, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ ...s.queueTitle, marginBottom: 0 }}>
                            <div style={s.queueNumber}>{store.name} ({store.shortCode})</div>
                            <span style={{ ...s.queueBadge, ...s.badgeUnknown }}>{activeBatchCount} active</span>
                          </div>
                          <div style={s.queueMeta}>
                            {batchCount} batch{batchCount === 1 ? '' : 'es'} • {itemCount} item{itemCount === 1 ? '' : 's'} • {photoCount} photo{photoCount === 1 ? '' : 's'}
                            <br />
                            Unlisted: {unlistedCount} • Needs retake: {needsRetakeCount} • Incomplete uploads: {incompleteUploadCount}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div style={s.label}>Batches</div>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {desktopBatchCards.length === 0 ? (
                    <div style={s.empty}>No batches for this store yet.</div>
                  ) : (
                    desktopBatchCards.map(({ batch, itemCount, photoCount, readyCount, uploadSummary }) => (
                      <button
                        key={batch.id}
                        onClick={() => {
                          setSelectedBatchId(batch.id)
                          setSelectedQueueItemId('')
                        }}
                        style={{
                          ...s.queueItem,
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderColor: selectedBatchId === batch.id ? '#60a5fa' : '#242424',
                          outline: 'none',
                        }}
                      >
                        <div style={{ ...s.queueContent, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ ...s.queueTitle, marginBottom: 0 }}>
                            <div style={s.queueNumber}>{batch.name}</div>
                            <span style={{ ...s.queueBadge, ...s.badgeUnknown }}>{batch.status}</span>
                          </div>
                          <div style={s.queueMeta}>
                            {itemCount} item{itemCount === 1 ? '' : 's'} • {photoCount} photo{photoCount === 1 ? '' : 's'} • {readyCount} ready
                            <br />
                            Upload: {uploadSummary.failedPhotos > 0 ? 'needs attention' : uploadSummary.pendingPhotos > 0 ? 'pending' : 'verified'}
                            {' '}• Safe to clear: {uploadSummary.safeToClearPhotos > 0 ? 'yes' : 'no'}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div style={s.label}>Items</div>
                <div style={s.filterRow}>
                  {(['all', 'new', 'listed', 'hold', 'needs_retake'] as QueueFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setQueueFilter(filter)}
                      style={{
                        ...s.filterButton,
                        ...(queueFilter === filter ? s.filterButtonActive : {}),
                      }}
                    >
                      {filter === 'needs_retake' ? 'Needs retake' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>

                {queueItems.length === 0 ? (
                  <div style={s.empty}>No items in this batch yet. Capture an item to start the queue.</div>
                ) : (
                  queueItems.map((item) => {
                    const fullItem = attachOrderedPhotosToItem(item, allPhotos)
                    const readiness = getItemReadiness(item, allPhotos)
                    const coverPhoto = fullItem.coverPhoto
                    return (
                      <QueueCard
                        key={item.id}
                        item={item}
                        readiness={readiness}
                        coverPhoto={coverPhoto}
                        isSelected={selectedQueueItemId === item.id}
                        onSelect={() => setSelectedQueueItemId(item.id)}
                        onPhotoClick={(photo) => setSelectedPhoto(photo)}
                        onUpdateStatus={async (status) => {
                          await handleUpdateListingStatus(item, status)
                        }}
                      />
                    )
                  })
                )}
              </div>
            </div>

            <div style={s.desktopPanel}>
              <div style={s.desktopPanelHead}>
                <div>
                  <div style={s.desktopPanelTitle}>Item detail</div>
                  <div style={s.desktopPanelMeta}>Current item status, photos, and metadata.</div>
                </div>
              </div>
              {!selectedDesktopItem ? (
                <div style={s.empty}>Select an item to inspect its photos and metadata.</div>
              ) : (
                <div style={s.desktopScrollList}>
                  <DesktopItemDetail
                    item={selectedDesktopItem}
                    photos={selectedDesktopItemPhotos}
                    readiness={selectedDesktopItemReadiness}
                    onPhotoClick={(photo) => setSelectedPhoto(photo)}
                    onUpdateStatus={async (status) => {
                      await handleUpdateListingStatus(selectedDesktopItem, status)
                    }}
                    onCopyText={handleCopyText}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {desktopMode === 'tools' && (
          <div style={s.desktopToolsGrid}>
            <div style={s.desktopPanel}>
              <div style={s.desktopPanelHead}>
                <div>
                  <div style={s.desktopPanelTitle}>Control center</div>
                  <div style={s.desktopPanelMeta}>Auth, sync, cleanup, and diagnostics live here.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 12, minHeight: 0 }}>
                <div style={s.authLine}>
                  <span>Supabase auth</span>
                  <span>
                    {authLoading
                      ? 'loading session'
                      : session
                        ? `signed in as ${session.user.email || session.user.id}`
                        : 'signed out'}
                  </span>
                </div>
                {authError && <div style={{ fontSize: 12, color: '#f87171' }}>{authError}</div>}
                {authMessage && <div style={{ fontSize: 12, color: '#93c5fd' }}>{authMessage}</div>}
                {!supabaseReady ? (
                  <div style={{ fontSize: 12, color: '#f59e0b' }}>
                    Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable auth and upload.
                  </div>
                ) : session ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSyncBatch} disabled={uploading}>
                      {uploading ? 'Syncing…' : 'Upload Batch'}
                    </button>
                    <button style={{ ...s.button, ...s.buttonSmall }} onClick={handleSignOut}>Sign out</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      style={s.select}
                      placeholder="Email for magic link"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      type="email"
                    />
                    <button
                      style={{ ...s.button, ...s.buttonPrimary }}
                      onClick={handleSendMagicLink}
                      disabled={!authEmail.trim()}
                    >
                      Send link
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={{ ...s.button, ...s.buttonSmall }}
                    onClick={handleSyncBatch}
                    disabled={!supabaseReady || !session || uploading || !selectedStoreId || !selectedBatchId}
                  >
                    Retry upload
                  </button>
                  <button
                    style={{ ...s.button, ...s.buttonSmall }}
                    onClick={handleRemoteCleanup}
                    disabled={!supabase || !session || remoteCleaning || !selectedBatch || (remoteCleanupReport?.eligiblePhotos || 0) === 0}
                  >
                    {remoteCleaning ? 'Cleaning…' : 'Delete remote assets'}
                  </button>
                  <button
                    style={{ ...s.button, ...s.buttonSmall }}
                    onClick={handleClearVerifiedLocalCopies}
                    disabled={!cleanupReport.safeToClear}
                  >
                    Clear local copies
                  </button>
                </div>

                {uploadProgress && <div style={s.progressBox}>{uploadProgress.message}</div>}
                {remoteCleanupProgress && <div style={s.progressBox}>{remoteCleanupProgress.message}</div>}
                {cleanupMessage && <div style={s.progressBox}>{cleanupMessage}</div>}

                <div style={{ display: 'grid', gap: 8, flex: 1, minHeight: 0 }}>
                  <details open>
                    <summary style={{ cursor: 'pointer', color: '#a8a8a8', fontSize: 13, fontWeight: 700 }}>
                      Diagnostics
                    </summary>
                    <div style={{ marginTop: 12 }}>
                      <DiagnosticsPanel
                        cameraState={cameraState}
                        capabilities={capabilities}
                        captureErrors={captureErrors}
                        storageErrors={storageErrors}
                        secureContext={secureContextInfo}
                        lastCaptureDiagnostics={lastCaptureDiagnostics}
                      />
                    </div>
                  </details>
                </div>
              </div>
            </div>

              <div style={s.desktopPanel}>
                <div style={s.desktopPanelHead}>
                  <div>
                    <div style={s.desktopPanelTitle}>Current item</div>
                    <div style={s.desktopPanelMeta}>{currentItem ? `Item ${currentItem.itemNumber}` : 'No current item'}</div>
                  </div>
                </div>
              <div style={{ minHeight: 0, display: 'grid', gap: 10 }}>
                {currentItem ? (
                  <>
                    {currentItemReadiness && (
                      <ItemLifecycleStrip item={currentItem} readiness={currentItemReadiness} compact />
                    )}
                    <PhotoList photos={currentItemPhotos} onPhotoClick={(photo) => setSelectedPhoto(photo)} />
                    <div style={s.queueMeta}>
                      SKU: {itemSku || 'missing'}
                      <br />
                      Note: {itemNote || 'missing'}
                      <br />
                      Weight: {itemWeight || 'missing'}
                      <br />
                      {statusMsg}
                    </div>
                  </>
                ) : (
                  <div style={s.empty}>Capture or select an item to see current item details.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <PhotoDetailModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  )
}

function QueueCard({
  item,
  readiness,
  coverPhoto,
  isSelected,
  onSelect,
  onPhotoClick,
  onUpdateStatus,
}: {
  item: ItemPacket
  readiness: ReturnType<typeof getItemReadiness>
  coverPhoto: StoredPhoto | null
  isSelected?: boolean
  onSelect?: () => void
  onPhotoClick?: (photo: StoredPhoto) => void
  onUpdateStatus: (status: ListingStatus) => Promise<void>
}) {
  const badgeStyle =
    item.listingStatus === 'listed'
      ? s.badgeListed
      : item.listingStatus === 'hold'
        ? s.badgeHold
        : item.listingStatus === 'needs_retake'
          ? s.badgeRetake
          : s.badgeNew

  return (
    <div
      style={{
        ...s.queueItem,
        borderColor: isSelected ? '#60a5fa' : '#242424',
        cursor: onSelect ? 'pointer' : 'default',
      }}
      onClick={onSelect}
    >
      <QueueThumb photo={coverPhoto} onClick={onPhotoClick} />
      <div style={s.queueContent}>
        <div style={s.queueTitle}>
          <div style={s.queueNumber}>Item {item.itemNumber}</div>
          <span style={{ ...s.queueBadge, ...badgeStyle }}>
            {item.listingStatus || 'new'}
          </span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <ItemLifecycleStrip item={item} readiness={readiness} compact />
        </div>
        <div style={s.queueMeta}>
          {item.photoIds.length} photo{item.photoIds.length === 1 ? '' : 's'} in order
          <br />
          {readiness.photoCount} in order • {readiness.missingPhotoCount} missing
          <br />
          {item.note ? `Note: ${item.note}` : 'Note missing'}
          <br />
          {item.sku ? `SKU: ${item.sku}` : 'SKU missing'}
          <br />
          {item.weight ? `Weight: ${item.weight}` : 'Weight missing'}
          <br />
          {item.dimensions ? `Dimensions: ${item.dimensions}` : 'Dimensions missing'}
        </div>
        <div style={s.queueActions}>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('new')}>New</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('listed')}>Listed</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('hold')}>Hold</button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('needs_retake')}>Needs retake</button>
        </div>
      </div>
    </div>
  )
}

function DesktopItemDetail({
  item,
  photos,
  readiness,
  onPhotoClick,
  onUpdateStatus,
  onCopyText,
}: {
  item: ItemPacket
  photos: StoredPhoto[]
  readiness: ReturnType<typeof getItemReadiness> | null
  onPhotoClick?: (photo: StoredPhoto) => void
  onUpdateStatus: (status: ListingStatus) => Promise<void>
  onCopyText: (text: string, label: string) => Promise<void>
}) {
  const availability =
    photos.length === 0
      ? 'No photos attached'
      : photos.every((photo) => photo.uploadStatus === 'verified' && ['verified', 'deleted'].includes(photo.remoteStatus || 'local'))
        ? 'Photos verified and safe to clear'
        : photos.some((photo) => photo.uploadStatus === 'failed' || photo.remoteStatus === 'failed')
          ? 'Upload incomplete or failed'
          : 'Upload pending'

  const mainPhoto = photos[0] || null

  return (
      <div style={{ ...s.queueItem, flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={s.queueTitle}>
          <div>
            <div style={s.queueNumber}>Item {item.itemNumber}</div>
            <div style={s.queueMeta}>
              {availability}
              <br />
              {readiness?.readyForHandoff ? 'Ready for handoff' : 'Needs info before listing'}
            </div>
          </div>
          <span
            style={{
              ...s.queueBadge,
            ...(item.listingStatus === 'listed'
              ? s.badgeListed
              : item.listingStatus === 'hold'
                ? s.badgeHold
                : item.listingStatus === 'needs_retake'
                  ? s.badgeRetake
                  : s.badgeNew),
          }}
        >
          {item.listingStatus || 'new'}
        </span>
      </div>

        {mainPhoto && (
          <div style={{ marginBottom: 8 }}>
            <QueueThumb photo={mainPhoto} onClick={onPhotoClick} />
          </div>
        )}

      {readiness && (
        <div style={{ marginBottom: 8 }}>
          <ItemLifecycleStrip item={item} readiness={readiness} compact />
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
        <div style={s.queueMeta}>
          SKU: {item.sku || 'missing'}
          <br />
          Note: {item.note || 'missing'}
          <br />
          Weight: {item.weight || 'missing'}
          <br />
          Dimensions: {item.dimensions || 'missing'}
          <br />
          {item.listingStatus === 'listed'
            ? `Listed: ${item.listedAt ? new Date(item.listedAt).toLocaleString() : 'pending'}`
            : 'Listed: not marked'}
          <br />
          {item.remoteExpiresAt
            ? `Remote cleanup: ${new Date(item.remoteExpiresAt).toLocaleString()}`
            : item.listingStatus === 'listed'
              ? 'Remote cleanup: pending retention window'
              : 'Remote cleanup: not listed'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onCopyText(item.sku || '', 'SKU')} disabled={!item.sku}>
            Copy SKU
          </button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onCopyText(item.note || '', 'Note')} disabled={!item.note}>
            Copy Note
          </button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onCopyText(item.weight || '', 'Weight')} disabled={!item.weight}>
            Copy Weight
          </button>
          <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onCopyText(item.dimensions || '', 'Dimensions')} disabled={!item.dimensions}>
            Copy Dimensions
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={s.label}>Ordered photos</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))' }}>
          {photos.length === 0 ? (
            <div style={s.empty}>No photos attached.</div>
          ) : (
            photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => onPhotoClick?.(photo)}
                style={{
                  ...s.queueItem,
                  flexDirection: 'column',
                  padding: 8,
                  marginBottom: 0,
                  textAlign: 'left',
                }}
              >
                <QueueThumb photo={photo} onClick={onPhotoClick} />
                <div style={s.queueMeta}>
                  #{index + 1}
                  <br />
                  {photo.uploadStatus || 'local'} / {photo.remoteStatus || 'not_uploaded'}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('new')}>New</button>
        <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('listed')}>Mark listed</button>
        <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('hold')}>Hold</button>
        <button style={{ ...s.button, ...s.buttonSmall }} onClick={() => void onUpdateStatus('needs_retake')}>Needs retake</button>
      </div>
    </div>
  )
}

function QueueThumb({ photo, onClick }: { photo: StoredPhoto | null; onClick?: (photo: StoredPhoto) => void }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) {
      setUrl(null)
      return
    }

    const blob = photo.thumbnailBlob || photo.blob
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo])

  if (!photo) {
    return <div style={s.queueThumbFallback}>📷</div>
  }

  return url ? (
    <img
      src={url}
      alt={`Item ${photo.id}`}
      style={{ ...s.queueThumb, cursor: onClick ? 'pointer' : 'default' }}
      onClick={() => onClick?.(photo)}
    />
  ) : (
    <div style={s.queueThumbFallback} />
  )
}

export { WorkspaceScreen as Phase1Screen }
