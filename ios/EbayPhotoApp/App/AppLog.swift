import Foundation
import os

enum AppLog {
  static let subsystem = Bundle.main.bundleIdentifier ?? "EbayPhotoApp"

  static let auth = Logger(subsystem: subsystem, category: "auth")
  static let upload = Logger(subsystem: subsystem, category: "upload")
  static let config = Logger(subsystem: subsystem, category: "config")
  static let camera = Logger(subsystem: subsystem, category: "camera")
  static let input = Logger(subsystem: subsystem, category: "input")
}
