export interface CameraPreferences {
  preferredZoom?: number
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
    }
  } catch {
    return { preferredZoom: 1 }
  }
}

export function saveCameraPreferences(patch: CameraPreferences): void {
  const current = loadCameraPreferences()
  const next: CameraPreferences = {
    preferredZoom: isFiniteNumber(patch.preferredZoom) ? patch.preferredZoom : current.preferredZoom ?? 1,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearCameraPreferences(): void {
  localStorage.removeItem(STORAGE_KEY)
}
