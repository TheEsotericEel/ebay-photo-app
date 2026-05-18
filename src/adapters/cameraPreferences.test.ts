import { beforeEach, describe, expect, it } from 'vitest'
import { clearCameraPreferences, loadCameraPreferences, saveCameraPreferences } from './cameraPreferences'

describe('cameraPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults zoom to 1 when nothing is saved', () => {
    expect(loadCameraPreferences()).toEqual({ preferredZoom: 1 })
  })

  it('saves and restores camera preferences', () => {
    saveCameraPreferences({
      preferredZoom: 0.5,
      preferredDeviceId: 'rear-telephoto',
      preferredWhiteBalanceMode: 'continuous',
      preferredTorch: true,
    })

    expect(loadCameraPreferences()).toEqual({
      preferredZoom: 0.5,
      preferredDeviceId: 'rear-telephoto',
      preferredWhiteBalanceMode: 'continuous',
      preferredTorch: true,
    })
  })

  it('clear removes stored preferences', () => {
    saveCameraPreferences({ preferredZoom: 2 })
    clearCameraPreferences()
    expect(loadCameraPreferences()).toEqual({ preferredZoom: 1 })
  })
})
