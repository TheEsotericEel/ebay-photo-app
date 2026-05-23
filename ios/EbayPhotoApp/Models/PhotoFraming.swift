import UIKit

enum PhotoFraming {
  // Configurable quality targets for eBay product photos.
  // 0.88 offers a modest quality bump over 0.82 with minimal speed/size impact.
  static let deliverableJPEGQuality: CGFloat = 0.95
  static let thumbnailJPEGQuality: CGFloat = 0.8
  static let defaultThumbnailMaxDimension: CGFloat = 160

  // Shared hardware-accelerated context
  private static let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  static func squareDeliverableAndThumbnail(
    from cgImage: CGImage,
    compressionQuality: CGFloat = deliverableJPEGQuality,
    thumbnailMaxDimension: CGFloat = defaultThumbnailMaxDimension
  ) -> (jpeg: Data, thumbnail: Data?)? {
    let t0 = Date()
    func msSince(_ d: Date) -> Int { Int(Date().timeIntervalSince(d) * 1000) }

    // 1. Hardware-accelerated decode (0ms from uncompressed CGImage)
    let ciImage = CIImage(cgImage: cgImage)
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
    compressionQuality: CGFloat = deliverableJPEGQuality,
    thumbnailMaxDimension: CGFloat = defaultThumbnailMaxDimension
  ) -> (jpeg: Data, thumbnail: Data?)? {
    let ciImage = CIImage(cgImage: cgImage)
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
