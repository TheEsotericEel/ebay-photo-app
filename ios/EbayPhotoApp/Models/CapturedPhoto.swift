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

