import AVFoundation
import ImageIO
import UIKit

/// Portrait-first JPEG deliverables for iOS capture → desktop import → eBay paste.
///
/// MVP assumptions (05/23/2026):
/// - Capture UI is portrait-locked; intentional landscape product capture is not supported.
/// - `AVCaptureConnection.videoRotationAngle` aligns the photo output with portrait preview.
/// - Software processing bakes orientation into pixels so uploaded JPEGs use EXIF orientation = 1.
/// - If deliverable pixels are still landscape-shaped after metadata bake, rotate once to portrait.
enum PhotoFraming {
  // Configurable quality targets for eBay product photos.
  // 0.88 offers a modest quality bump over 0.82 with minimal speed/size impact.
  static let deliverableJPEGQuality: CGFloat = 0.95
  static let thumbnailJPEGQuality: CGFloat = 0.8
  static let defaultThumbnailMaxDimension: CGFloat = 160

  // Shared hardware-accelerated context
  private static let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  /// EXIF orientation from capture metadata, if present.
  static func exifOrientation(from photo: AVCapturePhoto) -> UIImage.Orientation {
    guard
      let raw = photo.metadata[kCGImagePropertyOrientation as String] as? UInt32,
      let exif = CGImagePropertyOrientation(rawValue: raw)
    else {
      return .up
    }
    return UIImage.Orientation(exif)
  }

  /// EXIF tag to bake after inspecting pixel shape. Avoids double-rotation when connection
  /// rotation already produced portrait pixels but metadata still carries a rotation value.
  static func effectiveBakeOrientation(
    cgImage: CGImage,
    metadataOrientation: UIImage.Orientation
  ) -> UIImage.Orientation {
    guard metadataOrientation != .up else { return .up }
    if cgImage.height >= cgImage.width {
      return .up
    }
    return metadataOrientation
  }

  /// Bakes EXIF/device orientation into pixels and, for portrait-first capture, ensures height >= width.
  static func portraitLockedCGImage(
    from cgImage: CGImage,
    exifOrientation: UIImage.Orientation = .up
  ) -> CGImage {
    let bakeOrientation = effectiveBakeOrientation(
      cgImage: cgImage,
      metadataOrientation: exifOrientation
    )
    let upright = renderUprightPixels(from: cgImage, orientation: bakeOrientation)
    guard upright.width > upright.height else { return upright }
    return rotateCGImageClockwise90(upright) ?? upright
  }

  /// Renders pixels so JPEG consumers (desktop drag/export, eBay paste) see orientation=1 with correct layout.
  static func renderUprightPixels(
    from cgImage: CGImage,
    orientation: UIImage.Orientation
  ) -> CGImage {
    guard orientation != .up else { return cgImage }
    let image = UIImage(cgImage: cgImage, scale: 1, orientation: orientation)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
    let drawn = renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: image.size))
    }
    return drawn.cgImage ?? cgImage
  }

  static func rotateCGImageClockwise90(_ cgImage: CGImage) -> CGImage? {
    let rotated = CIImage(cgImage: cgImage).oriented(.right)
    return ciContext.createCGImage(rotated, from: rotated.extent)
  }

  static func squareDeliverableAndThumbnail(
    from cgImage: CGImage,
    exifOrientation: UIImage.Orientation = .up,
    compressionQuality: CGFloat = deliverableJPEGQuality,
    thumbnailMaxDimension: CGFloat = defaultThumbnailMaxDimension
  ) -> (jpeg: Data, thumbnail: Data?)? {
    let t0 = Date()
    func msSince(_ d: Date) -> Int { Int(Date().timeIntervalSince(d) * 1000) }

    let normalized = portraitLockedCGImage(from: cgImage, exifOrientation: exifOrientation)

    // 1. Hardware-accelerated decode (0ms from uncompressed CGImage)
    let ciImage = CIImage(cgImage: normalized)
    let t1 = Date()
    AppLog.camera.debug("[CAP-IMG] CIImage(cgImage:) took \(msSince(t0), privacy: .public)ms")

    // 2. Square crop math
    let extent = ciImage.extent
    let side = min(extent.width, extent.height)
    let ox = extent.origin.x + (extent.width - side) / 2
    let oy = extent.origin.y + (extent.height - side) / 2
    let cropRect = CGRect(x: ox, y: oy, width: side, height: side)
    
    let croppedCI = ciImage.cropped(to: cropRect)
    let t2 = Date()
    AppLog.camera.debug("[CAP-IMG] CIImage crop math took \(msSince(t1), privacy: .public)ms")

    // 3. Hardware-accelerated JPEG encode
    let colorSpace = ciImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()
    guard let jpegData = ciContext.jpegRepresentation(
      of: croppedCI,
      colorSpace: colorSpace,
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: compressionQuality]
    ) else { return nil }
    
    let t3 = Date()
    AppLog.camera.debug("[CAP-IMG] CIContext.jpegRepresentation took \(msSince(t2), privacy: .public)ms")

    // 4. Hardware-accelerated thumbnail
    let scale = thumbnailMaxDimension / side
    let scaledCI = croppedCI.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let thumbData = ciContext.jpegRepresentation(
      of: scaledCI,
      colorSpace: colorSpace,
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: PhotoFraming.thumbnailJPEGQuality]
    )
    
    AppLog.camera.debug("[CAP-IMG] thumbnail generation took \(msSince(t3), privacy: .public)ms")

    return (jpeg: jpegData, thumbnail: thumbData)
  }

  static func nativeDeliverableAndThumbnail(
    from cgImage: CGImage,
    exifOrientation: UIImage.Orientation = .up,
    compressionQuality: CGFloat = deliverableJPEGQuality,
    thumbnailMaxDimension: CGFloat = defaultThumbnailMaxDimension
  ) -> (jpeg: Data, thumbnail: Data?)? {
    let normalized = portraitLockedCGImage(from: cgImage, exifOrientation: exifOrientation)
    let ciImage = CIImage(cgImage: normalized)
    let colorSpace = ciImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()
    
    guard let jpegData = ciContext.jpegRepresentation(
      of: ciImage,
      colorSpace: colorSpace,
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: compressionQuality]
    ) else { return nil }
    
    let side = max(ciImage.extent.width, ciImage.extent.height)
    let scale = thumbnailMaxDimension / side
    let scaledCI = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let thumbData = ciContext.jpegRepresentation(
      of: scaledCI,
      colorSpace: colorSpace,
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: PhotoFraming.thumbnailJPEGQuality]
    )

    return (jpeg: jpegData, thumbnail: thumbData)
  }

  static func nativeDeliverableJPEG(
    from cgImage: CGImage,
    exifOrientation: UIImage.Orientation = .up,
    compressionQuality: CGFloat = deliverableJPEGQuality
  ) -> Data? {
    let normalized = portraitLockedCGImage(from: cgImage, exifOrientation: exifOrientation)
    let ciImage = CIImage(cgImage: normalized)
    let colorSpace = ciImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()

    return ciContext.jpegRepresentation(
      of: ciImage,
      colorSpace: colorSpace,
      options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: compressionQuality]
    )
  }

  /// Reads JPEG pixel dimensions and EXIF orientation (1 = upright pixels).
  static func jpegProperties(_ data: Data) -> (width: Int, height: Int, exifOrientation: Int)? {
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int
    else {
      return nil
    }
    let orientation = (properties[kCGImagePropertyOrientation] as? Int) ?? 1
    return (width, height, orientation)
  }
}

extension UIImage.Orientation {
  init(_ exif: CGImagePropertyOrientation) {
    switch exif {
    case .up:
      self = .up
    case .upMirrored:
      self = .upMirrored
    case .down:
      self = .down
    case .downMirrored:
      self = .downMirrored
    case .leftMirrored:
      self = .leftMirrored
    case .right:
      self = .right
    case .rightMirrored:
      self = .rightMirrored
    case .left:
      self = .left
    @unknown default:
      self = .up
    }
  }
}

extension UIImage {
  /// Redraws the image with .up orientation in a new pixel buffer.
  /// Only used by ebp_squareCroppedJPEGData (legacy path). The hot path
  /// in squareDeliverableAndThumbnail skips this entirely.
  func ebp_normalizedUpOrientation() -> UIImage {
    if imageOrientation == .up { return self }
    let format = UIGraphicsImageRendererFormat()
    format.scale = scale
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { _ in draw(in: CGRect(origin: .zero, size: size)) }
  }

  func ebp_squareCroppedJPEGData(compressionQuality: CGFloat = PhotoFraming.deliverableJPEGQuality) -> Data? {
    guard let cgImage = cgImage else { return nil }
    let pw = cgImage.width
    let ph = cgImage.height
    let side = min(pw, ph)
    guard let cropped = cgImage.cropping(
      to: CGRect(x: (pw - side) / 2, y: (ph - side) / 2, width: side, height: side)
    ) else { return nil }
    let square = UIImage(cgImage: cropped, scale: scale, orientation: imageOrientation)
    return square.jpegData(compressionQuality: compressionQuality)
  }

  func ebp_thumbnailData(maxDimension: CGFloat = PhotoFraming.defaultThumbnailMaxDimension) -> Data? {
    let largestSide = max(size.width, size.height)
    guard largestSide > 0 else { return nil }
    let scale = min(maxDimension / largestSide, 1)
    let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    let thumbnail = renderer.image { _ in
      draw(in: CGRect(origin: .zero, size: targetSize))
    }
    return thumbnail.jpegData(compressionQuality: PhotoFraming.thumbnailJPEGQuality)
  }
}
