import Combine
import Foundation

@MainActor
final class AppState: ObservableObject {
  #if DEBUG
  static let usesDevelopmentAuthBypass = true
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
      // Development-only shortcut so we can iterate on camera and item flow
      // before wiring the real Supabase auth path.
      isAuthenticated = true
      statusMessage = "Development auth bypass enabled."
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
