import Combine
import Foundation

@MainActor
final class AppState: ObservableObject {
  #if DEBUG
  static let usesDevelopmentAuthBypass: Bool = {
    guard let info = Bundle.main.infoDictionary else { return false }
    return parseConfigBool(info["DEVELOPMENT_AUTH_BYPASS"])
  }()
  #else
  static let usesDevelopmentAuthBypass = false
  #endif

  @Published var authEmail = ""
  @Published var authCode = ""
  @Published var authError = ""
  @Published var statusMessage = "Ready"
  @Published var uploadMessage = ""

  @Published var isAuthenticated = false
  @Published var activeStore = "Default Store"
  @Published var activeBatch = "Current Batch"
  @Published var currentItemNumber = 1

  @Published var currentItemSku = ""
  @Published var currentItemWeight = ""
  @Published var currentItemDimensions = ""
  @Published var currentItemNotes = ""
  @Published var capturedPhotos: [CapturedPhoto] = []

  init() {
    if Self.usesDevelopmentAuthBypass {
      // Development-only shortcut. Keep disabled by default and only enable
      // explicitly via DEVELOPMENT_AUTH_BYPASS in debug runtime config.
      isAuthenticated = true
      statusMessage = "Development auth bypass enabled."
      AppLog.auth.notice("Development auth bypass enabled")
    } else {
      AppLog.auth.notice("Development auth bypass disabled")
    }
  }

  private static func parseConfigBool(_ rawValue: Any?) -> Bool {
    switch rawValue {
    case let value as Bool:
      return value
    case let number as NSNumber:
      return number.boolValue
    case let text as String:
      let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      return ["1", "true", "yes", "y", "on"].contains(normalized)
    default:
      return false
    }
  }

  func clearCurrentItem() {
    currentItemSku = ""
    currentItemWeight = ""
    currentItemDimensions = ""
    currentItemNotes = ""
    capturedPhotos = []
  }

  func undoLastCapture() {
    guard capturedPhotos.isEmpty == false else {
      statusMessage = "Nothing to undo."
      return
    }

    capturedPhotos.removeLast()
    statusMessage = "Removed the most recent capture."
  }

  func advanceToNextItem() {
    currentItemNumber += 1
    clearCurrentItem()
    statusMessage = "Moved to item \(currentItemNumber)"
  }
}
