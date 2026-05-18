import { describe, expect, it } from 'vitest'
import { buildCameraTestLogText, formatCameraTestLogEntry } from './cameraTestLog'

describe('cameraTestLog', () => {
  it('formats a compact AI-friendly log entry', () => {
    const line = formatCameraTestLogEntry({
      action: 'torch',
      ratio: '1:1',
      requested: 'torch=false',
      outcome: 'ok',
      note: 'browser reflected torch off',
      videoState: {
        readyState: 4,
        paused: false,
        width: 1170,
        height: 1170,
        hasSrcObject: true,
      },
      trackState: {
        readyState: 'live',
        muted: false,
        enabled: true,
        label: 'Back Camera',
      },
      beforeSettings: {
        width: 1170,
        height: 1170,
        aspectRatio: 1,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 2,
        torch: true,
        whiteBalanceMode: 'continuous',
        focusMode: undefined,
        focusDistance: undefined,
        exposureMode: undefined,
        exposureTime: undefined,
        exposureCompensation: undefined,
        brightness: undefined,
        contrast: undefined,
        saturation: undefined,
        sharpness: undefined,
        iso: undefined,
      },
      afterSettings: {
        width: 1170,
        height: 1170,
        aspectRatio: 1,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 2,
        torch: false,
        whiteBalanceMode: 'continuous',
        focusMode: undefined,
        focusDistance: undefined,
        exposureMode: undefined,
        exposureTime: undefined,
        exposureCompensation: undefined,
        brightness: undefined,
        contrast: undefined,
        saturation: undefined,
        sharpness: undefined,
        iso: undefined,
      },
      settings: {
        width: 1170,
        height: 1170,
        aspectRatio: 1,
        facingMode: 'environment',
        deviceId: 'cam-a',
        zoom: 2,
        torch: false,
        whiteBalanceMode: 'continuous',
        focusMode: undefined,
        focusDistance: undefined,
        exposureMode: undefined,
        exposureTime: undefined,
        exposureCompensation: undefined,
        brightness: undefined,
        contrast: undefined,
        saturation: undefined,
        sharpness: undefined,
        iso: undefined,
      },
    })

    expect(line).toContain('action=torch')
    expect(line).toContain('ratio=1:1')
    expect(line).toContain('constraints=torch=false')
    expect(line).toContain('outcome=ok')
    expect(line).toContain('video=rs4 1170x1170 paused=false attached=true')
    expect(line).toContain('track=live muted=false enabled=true label=Back Camera')
    expect(line).toContain('before=device=cam-a')
    expect(line).toContain('after=device=cam-a')
    expect(line).toContain('device=cam-a')
    expect(line).toContain('zoom=2')
    expect(line).toContain('torch=false')
    expect(line).toContain('wb=continuous')
    expect(line).toContain('note=browser reflected torch off')
  })

  it('wraps copied camera logs in a plain text header and footer', () => {
    const text = buildCameraTestLogText(['one', 'two'])
    expect(text).toContain('=== CAMERA TEST LOG ===')
    expect(text).toContain('one')
    expect(text).toContain('two')
    expect(text).toContain('=== END CAMERA TEST LOG ===')
  })
})
