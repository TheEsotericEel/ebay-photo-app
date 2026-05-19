import UIKit

enum PhotoFraming {
  static func squareDeliverableJPEG(from imageData: Data, compressionQuality: CGFloat = 0.92) -> Data? {
    guard let image = UIImage(data: imageData) else { return nil }
    return image.ebp_squareCroppedJPEGData(compressionQuality: compressionQuality)
  }
}

extension UIImage {
  func ebp_normalizedUpOrientation() -> UIImage {
    if imageOrientation == .up {
      return self
    }

    let format = UIGraphicsImageRendererFormat()
    format.scale = scale
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { _ in
      draw(in: CGRect(origin: .zero, size: size))
    }
  }

  func ebp_squareCroppedJPEGData(compressionQuality: CGFloat = 0.92) -> Data? {
    let normalized = ebp_normalizedUpOrientation()
    guard let cgImage = normalized.cgImage else { return nil }

    let pixelWidth = cgImage.width
    let pixelHeight = cgImage.height
    let side = min(pixelWidth, pixelHeight)
    let originX = (pixelWidth - side) / 2
    let originY = (pixelHeight - side) / 2

    guard let cropped = cgImage.cropping(
      to: CGRect(x: originX, y: originY, width: side, height: side)
    ) else {
      return nil
    }

    let square = UIImage(cgImage: cropped, scale: normalized.scale, orientation: .up)
    return square.jpegData(compressionQuality: compressionQuality)
  }
}
