const CAMERA_PERMISSION_KEY = 'cameraPermissionGranted'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadCameraPermissionGranted(): boolean {
  if (!canUseStorage()) {
    return false
  }

  return window.localStorage.getItem(CAMERA_PERMISSION_KEY) === 'true'
}

export function saveCameraPermissionGranted(granted: boolean): void {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(CAMERA_PERMISSION_KEY, granted ? 'true' : 'false')
}

