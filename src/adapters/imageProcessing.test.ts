import { describe, it, expect, vi } from 'vitest'
import { centeredSquareRect, getCssAspectRatio, calculateAspectCrop, isValidOutputRatio, loadDefaultRatioFromStorage, saveDefaultRatioToStorage } from './imageProcessing'

// Note: Canvas-based image processing tests (generateThumbnail, cropBitmapToBlob)
// require a browser DOM environment with canvas support. These are impractical to test in Node.js/vitest.
// Manual verification on iPhone Safari is required for actual canvas rendering.
//
// No-downscale behavior change (preserve original resolution):
// - calculateAspectCrop returns crop dimensions without scaling
// - A 3024x4032 input with 1:1 should crop to 3024x3024 (not downscale to 1200x1200)
// - This requires manual verification on iPhone Safari to confirm actual blob dimensions

describe('centeredSquareRect', () => {
  it('returns full width as size for landscape', () => {
    const { x, y, size } = centeredSquareRect(1920, 1080)
    expect(size).toBe(1080)
    expect(x).toBe(420)
    expect(y).toBe(0)
  })

  it('returns full height as size for portrait', () => {
    const { x, y, size } = centeredSquareRect(1080, 1920)
    expect(size).toBe(1080)
    expect(x).toBe(0)
    expect(y).toBe(420)
  })

  it('returns zero offsets for square input', () => {
    const { x, y, size } = centeredSquareRect(1200, 1200)
    expect(size).toBe(1200)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('centers correctly for odd dimensions', () => {
    const { x, y, size } = centeredSquareRect(100, 71)
    expect(size).toBe(71)
    expect(x).toBe(14.5)
    expect(y).toBe(0)
  })

  it('handles iPhone high-res portrait dimensions', () => {
    const { x, y, size } = centeredSquareRect(3024, 4032)
    expect(size).toBe(3024)
    expect(x).toBe(0)
    expect(y).toBe(504)
  })

  it('handles iPhone high-res landscape dimensions', () => {
    const { x, y, size } = centeredSquareRect(4032, 3024)
    expect(size).toBe(3024)
    expect(x).toBe(504)
    expect(y).toBe(0)
  })

  // Documents expected no-downscale behavior:
  // - 3024x4032 input should crop to 3024x3024 (not downscale to 1200x1200)
  // - The 'size' value from centeredSquareRect is used as the output canvas size
  it('documents expected output dimensions for iPhone high-res portrait', () => {
    const { size } = centeredSquareRect(3024, 4032)
    // With no-downscale behavior, output should be 3024x3024 (the cropped square size)
    expect(size).toBe(3024)
    // Previously would have been downscaled to 1200x1200
  })

  // Documents expected ratio crop behavior:
  // - 3024x4032 + full frame -> 3024x4032 (no crop)
  // - 3024x4032 + 1:1 -> 3024x3024 (centered square crop)
  // - 3024x4032 + 4:3 -> 3024x4032 (portrait-aware: 4:3 on portrait source means 3:4, matches source)
  // - 3024x4032 + 16:9 -> 2268x4032 (portrait-aware: 16:9 on portrait source means 9:16, crop width)
  // - 480x640 + full -> 480x640 (no crop, no upscale)
  // - 480x640 + 1:1 -> 480x480 (centered square, no upscale)
  // - 4032x3024 + 4:3 -> 4032x3024 (landscape-aware: 4:3 on landscape source means 4:3, matches source)
  // - 4032x3024 + 16:9 -> 4032x2268 (landscape-aware: 16:9 on landscape source means 16:9, crop height)
  // All crops preserve original resolution without upscaling/downscaling
  it('documents expected ratio crop behavior for high-res portrait', () => {
    // For 3024x4032 portrait (3:4):
    // full: 3024x4032
    // 1:1: 3024x3024 (min side)
    // 4:3: 3024x4032 (portrait-aware: 4:3 means 3:4, matches source aspect)
    // 16:9: 2268x4032 (portrait-aware: 16:9 means 9:16, crop width to 2268)
    const { size } = centeredSquareRect(3024, 4032)
    expect(size).toBe(3024) // 1:1 case
    // Actual ratio processing requires canvas - manual verification needed
  })

  it('documents expected ratio crop behavior for high-res landscape', () => {
    // For 4032x3024 landscape (4:3):
    // full: 4032x3024
    // 1:1: 3024x3024 (min side)
    // 4:3: 4032x3024 (landscape-aware: 4:3 matches source aspect)
    // 16:9: 4032x2268 (landscape-aware: 16:9, crop height to 2268)
    const { size } = centeredSquareRect(4032, 3024)
    expect(size).toBe(3024) // 1:1 case
    // Actual ratio processing requires canvas - manual verification needed
  })
})

describe('getCssAspectRatio', () => {
  it('returns 3/4 fallback for full mode without dimensions', () => {
    expect(getCssAspectRatio('full')).toBe('3 / 4')
    expect(getCssAspectRatio('full', null)).toBe('3 / 4')
    expect(getCssAspectRatio('full', undefined)).toBe('3 / 4')
  })

  it('returns actual aspect ratio for full mode with dimensions', () => {
    expect(getCssAspectRatio('full', { width: 3024, height: 4032 })).toBe('3024 / 4032')
    expect(getCssAspectRatio('full', { width: 4032, height: 3024 })).toBe('4032 / 3024')
    expect(getCssAspectRatio('full', { width: 1920, height: 1080 })).toBe('1920 / 1080')
  })

  it('returns 1/1 for square ratio', () => {
    expect(getCssAspectRatio('1:1')).toBe('1 / 1')
    expect(getCssAspectRatio('1:1', { width: 3024, height: 4032 })).toBe('1 / 1')
  })

  it('returns 3/4 for 4:3 ratio (portrait-aware)', () => {
    expect(getCssAspectRatio('4:3')).toBe('3 / 4')
    expect(getCssAspectRatio('4:3', { width: 3024, height: 4032 })).toBe('3 / 4')
  })

  it('returns 9/16 for 16:9 ratio (portrait-aware)', () => {
    expect(getCssAspectRatio('16:9')).toBe('9 / 16')
    expect(getCssAspectRatio('16:9', { width: 3024, height: 4032 })).toBe('9 / 16')
  })

  it('handles edge case with zero dimensions', () => {
    expect(getCssAspectRatio('full', { width: 0, height: 0 })).toBe('3 / 4')
    expect(getCssAspectRatio('full', { width: 0, height: 1080 })).toBe('3 / 4')
  })
})

describe('calculateAspectCrop', () => {
  // Test 1:1 ratio (square)
  it('calculates 1:1 square crop for portrait 3024x4032', () => {
    const crop = calculateAspectCrop(3024, 4032, 1)
    expect(crop.width).toBe(3024)
    expect(crop.height).toBe(3024)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(504) // (4032 - 3024) / 2
  })

  it('calculates 1:1 square crop for landscape 4032x3024', () => {
    const crop = calculateAspectCrop(4032, 3024, 1)
    expect(crop.width).toBe(3024)
    expect(crop.height).toBe(3024)
    expect(crop.x).toBe(504) // (4032 - 3024) / 2
    expect(crop.y).toBe(0)
  })

  // Test 4:3 ratio (portrait-aware)
  it('calculates 4:3 crop for portrait 3024x4032 (becomes 3:4, matches source)', () => {
    const crop = calculateAspectCrop(3024, 4032, 4/3)
    // Source is 3:4, target is 4:3 but portrait-aware makes it 3:4
    // Since source aspect (0.75) equals adjusted target (0.75), no crop needed
    expect(crop.width).toBe(3024)
    expect(crop.height).toBe(4032)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  it('calculates 4:3 crop for landscape 4032x3024 (matches source)', () => {
    const crop = calculateAspectCrop(4032, 3024, 4/3)
    // Source is 4:3, target is 4:3
    // Since source aspect (1.333) equals target (1.333), no crop needed
    expect(crop.width).toBe(4032)
    expect(crop.height).toBe(3024)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  // Test 16:9 ratio (portrait-aware)
  it('calculates 16:9 crop for portrait 3024x4032 (becomes 9:16, crops width)', () => {
    const crop = calculateAspectCrop(3024, 4032, 16/9)
    // Source is 3:4 (0.75), target is 16:9 (1.777) but portrait-aware makes it 9:16 (0.5625)
    // Source is wider than target, so crop width
    // cropWidth = 4032 * 0.5625 = 2268
    expect(crop.width).toBe(2268)
    expect(crop.height).toBe(4032)
    expect(crop.x).toBe(378) // (3024 - 2268) / 2
    expect(crop.y).toBe(0)
  })

  it('calculates 16:9 crop for landscape 4032x3024 (crops height)', () => {
    const crop = calculateAspectCrop(4032, 3024, 16/9)
    // Source is 4:3 (1.333), target is 16:9 (1.777)
    // Source is narrower than target, so crop height
    // cropHeight = 4032 / 1.777 = 2268
    expect(crop.width).toBe(4032)
    expect(crop.height).toBe(2268)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(378) // (3024 - 2268) / 2
  })

  // Test low-res fallback (no upscale)
  it('does not upscale low-res 480x640 for 1:1', () => {
    const crop = calculateAspectCrop(480, 640, 1)
    expect(crop.width).toBe(480)
    expect(crop.height).toBe(480)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(80) // (640 - 480) / 2
  })

  it('does not upscale low-res 480x640 for 16:9', () => {
    const crop = calculateAspectCrop(480, 640, 16/9)
    // Source is 3:4 (0.75), target is 16:9 (1.777) but portrait-aware makes it 9:16 (0.5625)
    // Source is wider than target, so crop width
    // cropWidth = 640 * 0.5625 = 360
    expect(crop.width).toBe(360)
    expect(crop.height).toBe(640)
    expect(crop.x).toBe(60) // (480 - 360) / 2
    expect(crop.y).toBe(0)
  })
})

describe('isValidOutputRatio', () => {
  it('returns true for valid ratios', () => {
    expect(isValidOutputRatio('full')).toBe(true)
    expect(isValidOutputRatio('1:1')).toBe(true)
    expect(isValidOutputRatio('4:3')).toBe(true)
    expect(isValidOutputRatio('16:9')).toBe(true)
  })

  it('returns false for invalid ratios', () => {
    expect(isValidOutputRatio('invalid')).toBe(false)
    expect(isValidOutputRatio('')).toBe(false)
    expect(isValidOutputRatio(null)).toBe(false)
    expect(isValidOutputRatio(undefined)).toBe(false)
    expect(isValidOutputRatio('3:2')).toBe(false)
  })
})

describe('loadDefaultRatioFromStorage', () => {
  it('returns stored ratio when valid', () => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = vi.fn((key: string) => {
      if (key === 'defaultRatio') return '4:3'
      return originalGetItem(key)
    })
    expect(loadDefaultRatioFromStorage()).toBe('4:3')
    Storage.prototype.getItem = originalGetItem
  })

  it('returns full when stored value is invalid', () => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = vi.fn((key: string) => {
      if (key === 'defaultRatio') return 'invalid'
      return originalGetItem(key)
    })
    expect(loadDefaultRatioFromStorage()).toBe('full')
    Storage.prototype.getItem = originalGetItem
  })

  it('returns full when localStorage is empty', () => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = vi.fn((key: string) => {
      if (key === 'defaultRatio') return null
      return originalGetItem(key)
    })
    expect(loadDefaultRatioFromStorage()).toBe('full')
    Storage.prototype.getItem = originalGetItem
  })
})

describe('saveDefaultRatioToStorage', () => {
  it('saves valid ratio to localStorage', () => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn()
    saveDefaultRatioToStorage('4:3')
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('defaultRatio', '4:3')
    Storage.prototype.setItem = originalSetItem
  })

  it('throws error for invalid ratio', () => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn()
    expect(() => saveDefaultRatioToStorage('invalid' as any)).toThrow('Invalid OutputRatio')
    Storage.prototype.setItem = originalSetItem
  })
})
