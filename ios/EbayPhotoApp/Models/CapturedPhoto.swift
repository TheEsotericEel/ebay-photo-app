import Foundation
import UIKit

struct CapturedPhoto: Identifiable {
  let id: UUID
  let data: Data
  let thumbnailData: Data?
  let lensLabel: String
  let capturedAt: Date

  init(
    id: UUID = UUID(),
    data: Data,
    thumbnailData: Data?,
    lensLabel: String,
    capturedAt: Date
  ) {
    self.id = id
    self.data = data
    self.thumbnailData = thumbnailData
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

