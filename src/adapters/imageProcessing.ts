export type OutputRatio = 'full' | '1:1' | '4:3' | '16:9'

const VALID_OUTPUT_RATIOS: OutputRatio[] = ['full', '1:1', '4:3', '16:9']

/**
 * Validates if a string is a valid OutputRatio.
 * Used for localStorage persistence to ensure safe values.
 */
export function isValidOutputRatio(value: string | null | undefined): value is OutputRatio {
  return value !== null && value !== undefined && VALID_OUTPUT_RATIOS.includes(value as OutputRatio)
}

/**
 * Loads the default ratio from localStorage with validation.
 * Returns the stored ratio if valid, otherwise returns 'full' as fallback.
 * This is the single source of truth for ratio persistence across the app.
 */
export function loadDefaultRatioFromStorage(): OutputRatio {
  const saved = localStorage.getItem('defaultRatio')
  return isValidOutputRatio(saved) ? saved : 'full'
}

/**
 * Saves the default ratio to localStorage.
 * Only valid OutputRatio values should be passed.
 */
export function saveDefaultRatioToStorage(ratio: OutputRatio): void {
  if (!isValidOutputRatio(ratio)) {
    throw new Error(`Invalid OutputRatio: ${ratio}`)
  }
  localStorage.setItem('defaultRatio', ratio)
}

/**
 * Returns the CSS aspect ratio string for a given OutputRatio.
 * For portrait sources (iPhone), 4:3 means 3:4, 16:9 means 9:16.
 * For Full mode with known dimensions, uses actual aspect ratio; otherwise falls back to 3/4.
 */
export function getCssAspectRatio(
  ratio: OutputRatio,
  videoDimensions?: { width: number; height: number } | null,
): string {
  if (ratio === 'full') {
    if (videoDimensions && videoDimensions.width > 0 && videoDimensions.height > 0) {
      return `${videoDimensions.width} / ${videoDimensions.height}`
    }
    return '3 / 4' // Safe fallback for iPhone portrait
  }
  if (ratio === '1:1') return '1 / 1'
  if (ratio === '4:3') return '3 / 4' // iPhone portrait is typically 3:4
  if (ratio === '16:9') return '9 / 16' // iPhone portrait is typically 9:16
  return '3 / 4'
}

export interface ProcessedPhoto {
  blob: Blob
  size: number
  mimeType: string
  capturedAt: string
  sourceWidth?: number
  sourceHeight?: number
  outputWidth?: number
  outputHeight?: number
  thumbnailBlob?: Blob
  thumbnailSize?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
  ratio?: OutputRatio
}

export interface ImageProcessingAdapter {
  process(source: Blob, capturedAt: string, ratio: OutputRatio, sourceWidth?: number, sourceHeight?: number): Promise<ProcessedPhoto>
  generateThumbnail(source: Blob, maxSize: number): Promise<{ blob: Blob; size: number; width: number; height: number }>
}

export const LISTING_SQUARE_SIZE = 1200
export const LISTING_JPEG_QUALITY = 0.92
export const THUMBNAIL_MAX_SIZE = 200
export const THUMBNAIL_JPEG_QUALITY = 0.85

export class CanvasImageProcessingAdapter implements ImageProcessingAdapter {
  private readonly jpegQuality: number

  constructor(jpegQuality = LISTING_JPEG_QUALITY) {
    this.jpegQuality = jpegQuality
  }

  async process(source: Blob, capturedAt: string, ratio: OutputRatio, sourceWidth?: number, sourceHeight?: number): Promise<ProcessedPhoto> {
    const bitmap = await createImageBitmap(source)
    const actualSourceWidth = sourceWidth || bitmap.width
    const actualSourceHeight = sourceHeight || bitmap.height
    console.log(`Image processing source: ${actualSourceWidth}x${actualSourceHeight}, ratio: ${ratio}`)
    
    let blob: Blob
    let outputWidth: number
    let outputHeight: number
    
    if (ratio === 'full') {
      // No crop, preserve full frame
      blob = await copyBitmapToBlob(bitmap, this.jpegQuality)
      outputWidth = actualSourceWidth
      outputHeight = actualSourceHeight
    } else if (ratio === '1:1') {
      blob = await cropSquareFromBitmap(bitmap, this.jpegQuality)
      const side = Math.min(actualSourceWidth, actualSourceHeight)
      outputWidth = side
      outputHeight = side
    } else if (ratio === '4:3') {
      const crop = calculateAspectCrop(actualSourceWidth, actualSourceHeight, 4/3)
      blob = await cropBitmapToBlob(bitmap, crop.x, crop.y, crop.width, crop.height, this.jpegQuality)
      outputWidth = crop.width
      outputHeight = crop.height
    } else if (ratio === '16:9') {
      const crop = calculateAspectCrop(actualSourceWidth, actualSourceHeight, 16/9)
      blob = await cropBitmapToBlob(bitmap, crop.x, crop.y, crop.width, crop.height, this.jpegQuality)
      outputWidth = crop.width
      outputHeight = crop.height
    } else {
      // Fallback to full frame
      blob = await copyBitmapToBlob(bitmap, this.jpegQuality)
      outputWidth = actualSourceWidth
      outputHeight = actualSourceHeight
    }
    
    console.log(`Image processing output: ${outputWidth}x${outputHeight}`)
    
    // Generate thumbnail
    const thumbnail = await this.generateThumbnail(source, THUMBNAIL_MAX_SIZE)
    
    bitmap.close()
    return {
      blob,
      size: blob.size,
      mimeType: 'image/jpeg',
      capturedAt,
      sourceWidth: actualSourceWidth,
      sourceHeight: actualSourceHeight,
      outputWidth,
      outputHeight,
      thumbnailBlob: thumbnail.blob,
      thumbnailSize: thumbnail.size,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height,
      ratio,
    }
  }

  async generateThumbnail(source: Blob, maxSize: number): Promise<{ blob: Blob; size: number; width: number; height: number }> {
    const bitmap = await createImageBitmap(source)
    const { width, height } = bitmap
    const scale = Math.min(maxSize / width, maxSize / height, 1)
    const thumbWidth = Math.round(width * scale)
    const thumbHeight = Math.round(height * scale)
    
    const canvas = document.createElement('canvas')
    canvas.width = thumbWidth
    canvas.height = thumbHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2d context for thumbnail')
    
    ctx.drawImage(bitmap, 0, 0, thumbWidth, thumbHeight)
    bitmap.close()
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error('Thumbnail toBlob returned null'))
        },
        'image/jpeg',
        THUMBNAIL_JPEG_QUALITY,
      )
    })
    
    return { blob, size: blob.size, width: thumbWidth, height: thumbHeight }
  }
}

/**
 * Crops the largest centered square from a bitmap and preserves original resolution.
 * No downscaling — output size equals the cropped square size.
 * Pure function — no side effects beyond canvas allocation.
 */
export async function cropSquareFromBitmap(
  bitmap: ImageBitmap,
  jpegQuality: number,
): Promise<Blob> {
  const { width, height } = bitmap
  const side = Math.min(width, height)
  const sx = Math.floor((width - side) / 2)
  const sy = Math.floor((height - side) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context for square crop')

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, side, side)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Square crop toBlob returned null'))
      },
      'image/jpeg',
      jpegQuality,
    )
  })
}

/**
 * Copies a bitmap to a blob without any cropping or resizing.
 * Preserves full original resolution.
 */
async function copyBitmapToBlob(bitmap: ImageBitmap, jpegQuality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context for copy')

  ctx.drawImage(bitmap, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Copy toBlob returned null'))
      },
      'image/jpeg',
      jpegQuality,
    )
  })
}

/**
 * Calculates the largest centered crop for a target aspect ratio.
 * Returns the crop rect (x, y, width, height) in source coordinates.
 * No upscaling/downscaling — crop dimensions are derived from source.
 * Portrait-aware: 4:3 on portrait source becomes 3:4, 16:9 on portrait source becomes 9:16.
 */
export function calculateAspectCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number,
): { x: number; y: number; width: number; height: number } {
  const sourceAspect = sourceWidth / sourceHeight
  const isPortrait = sourceHeight > sourceWidth
  
  // Adjust target aspect for portrait sources
  const adjustedTargetAspect = isPortrait ? 1 / targetAspect : targetAspect
  
  if (sourceAspect > adjustedTargetAspect) {
    // Source is wider than target: crop width
    const cropHeight = sourceHeight
    const cropWidth = Math.round(cropHeight * adjustedTargetAspect)
    const x = Math.floor((sourceWidth - cropWidth) / 2)
    return { x, y: 0, width: cropWidth, height: cropHeight }
  } else {
    // Source is taller than target: crop height
    const cropWidth = sourceWidth
    const cropHeight = Math.round(cropWidth / adjustedTargetAspect)
    const y = Math.floor((sourceHeight - cropHeight) / 2)
    return { x: 0, y, width: cropWidth, height: cropHeight }
  }
}

/**
 * Crops a bitmap to a specific rect and returns a blob.
 * Preserves the crop resolution without scaling.
 */
async function cropBitmapToBlob(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  jpegQuality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context for crop')

  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Crop toBlob returned null'))
      },
      'image/jpeg',
      jpegQuality,
    )
  })
}

/**
 * Returns the source rect for the centered square crop — usable for both
 * actual cropping and drawing the overlay in the UI.
 */
export function centeredSquareRect(
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number; size: number } {
  const size = Math.min(containerWidth, containerHeight)
  const x = (containerWidth - size) / 2
  const y = (containerHeight - size) / 2
  return { x, y, size }
}
