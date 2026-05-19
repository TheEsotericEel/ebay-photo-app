export interface CameraPreferences {
  preferredZoom?: number
  preferredLensDeviceIds?: Record<string, string>
}

const STORAGE_KEY = 'cameraPreferences'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function loadCameraPreferences(): CameraPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { preferredZoom: 1, preferredLensDeviceIds: {} }
    }

    const parsed = JSON.parse(raw) as CameraPreferences
    return {
      preferredZoom: isFiniteNumber(parsed.preferredZoom) ? parsed.preferredZoom : 1,
      preferredLensDeviceIds: parsed.preferredLensDeviceIds && typeof parsed.preferredLensDeviceIds === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.preferredLensDeviceIds).filter(([, value]) => typeof value === 'string' && value.length > 0),
          )
        : {},
    }
  } catch {
    return { preferredZoom: 1, preferredLensDeviceIds: {} }
  }
}

export function saveCameraPreferences(patch: CameraPreferences): void {
  const current = loadCameraPreferences()
  const next: CameraPreferences = {
    preferredZoom: isFiniteNumber(patch.preferredZoom) ? patch.preferredZoom : current.preferredZoom ?? 1,
    preferredLensDeviceIds: patch.preferredLensDeviceIds && typeof patch.preferredLensDeviceIds === 'object'
      ? Object.fromEntries(
          Object.entries(patch.preferredLensDeviceIds).filter(([, value]) => typeof value === 'string' && value.length > 0),
        )
      : current.preferredLensDeviceIds ?? {},
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearCameraPreferences(): void {
  localStorage.removeItem(STORAGE_KEY)
}
