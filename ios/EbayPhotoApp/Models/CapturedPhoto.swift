import Foundation
import UIKit

struct CapturedPhoto: Identifiable {
  let id: UUID
  let data: Data
  let thumbnailData: Data?
  /// Full native-frame JPEG when the listing deliverable is a square crop.
  let originalData: Data?
  let lensLabel: String
  let capturedAt: Date

  init(
    id: UUID = UUID(),
    data: Data,
    thumbnailData: Data?,
    originalData: Data? = nil,
    lensLabel: String,
    capturedAt: Date
  ) {
    self.id = id
    self.data = data
    self.thumbnailData = thumbnailData
    self.originalData = originalData
    self.lensLabel = lensLabel
    self.capturedAt = capturedAt
  }
}

extension CapturedPhoto {
  var thumbnailImage: UIImage? {
    guard let thumbnailData else { return nil }
    return UIImage(data: thumbnailData)
  }
}

