import Foundation
import UIKit

struct CapturedPhoto: Identifiable {
  let id = UUID()
  let data: Data
  let thumbnailData: Data?
  let lensLabel: String
  let capturedAt: Date
}

extension CapturedPhoto {
  var thumbnailImage: UIImage? {
    guard let thumbnailData else { return nil }
    return UIImage(data: thumbnailData)
  }
}

extension UIImage {
  func ebp_thumbnailData(maxDimension: CGFloat = 160) -> Data? {
    let largestSide = max(size.width, size.height)
    guard largestSide > 0 else { return nil }

    let scale = min(maxDimension / largestSide, 1)
    let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    let thumbnail = renderer.image { _ in
      draw(in: CGRect(origin: .zero, size: targetSize))
    }
    return thumbnail.jpegData(compressionQuality: 0.8)
  }
}
