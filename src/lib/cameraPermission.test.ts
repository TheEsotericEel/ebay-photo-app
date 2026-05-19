import { beforeEach, describe, expect, it } from 'vitest'
import { loadCameraPermissionGranted, saveCameraPermissionGranted } from './cameraPermission'

describe('cameraPermission', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to false', () => {
    expect(loadCameraPermissionGranted()).toBe(false)
  })

  it('persists granted state', () => {
    saveCameraPermissionGranted(true)
    expect(loadCameraPermissionGranted()).toBe(true)
  })

  it('persists denied state', () => {
    saveCameraPermissionGranted(false)
    expect(loadCameraPermissionGranted()).toBe(false)
  })
})
