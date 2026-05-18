export interface CameraPreferences {
  preferredZoom?: number
  preferredDeviceId?: string
  preferredWhiteBalanceMode?: string
  preferredTorch?: boolean
}

const STORAGE_KEY = 'cameraPreferences'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function loadCameraPreferences(): CameraPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { preferredZoom: 1 }
    }

    const parsed = JSON.parse(raw) as CameraPreferences
    return {
      preferredZoom: isFiniteNumber(parsed.preferredZoom) ? parsed.preferredZoom : 1,
      preferredDeviceId: typeof parsed.preferredDeviceId === 'string' ? parsed.preferredDeviceId : undefined,
      preferredWhiteBalanceMode: typeof parsed.preferredWhiteBalanceMode === 'string' ? parsed.preferredWhiteBalanceMode : undefined,
      preferredTorch: typeof parsed.preferredTorch === 'boolean' ? parsed.preferredTorch : undefined,
    }
  } catch {
    return { preferredZoom: 1 }
  }
}

export function saveCameraPreferences(patch: CameraPreferences): void {
  const current = loadCameraPreferences()
  const next: CameraPreferences = {
    preferredZoom: isFiniteNumber(patch.preferredZoom) ? patch.preferredZoom : current.preferredZoom ?? 1,
    preferredDeviceId: typeof patch.preferredDeviceId === 'string' ? patch.preferredDeviceId : current.preferredDeviceId,
    preferredWhiteBalanceMode:
      typeof patch.preferredWhiteBalanceMode === 'string' ? patch.preferredWhiteBalanceMode : current.preferredWhiteBalanceMode,
    preferredTorch: typeof patch.preferredTorch === 'boolean' ? patch.preferredTorch : current.preferredTorch,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearCameraPreferences(): void {
  localStorage.removeItem(STORAGE_KEY)
}
