import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearCameraPreferences, loadCameraPreferences, saveCameraPreferences } from './cameraPreferences'

describe('cameraPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    clearCameraPreferences()
  })

  it('defaults preferredZoom to 1', () => {
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

  it('saves and restores preferredZoom', () => {
    saveCameraPreferences({ preferredZoom: 0.5 })
    expect(loadCameraPreferences()).toEqual({ preferredZoom: 0.5 })
  })

  it('falls back to 1 for invalid stored values', () => {
    localStorage.setItem('cameraPreferences', JSON.stringify({ preferredZoom: 'bad' }))
    expect(loadCameraPreferences()).toEqual({ preferredZoom: 1 })
  })
})
