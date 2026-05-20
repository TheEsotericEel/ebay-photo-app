import Combine
import Foundation

private struct PersistedCaptureContext: Codable {
  var captureStoreName: String
  var captureStoreShortCode: String
  var captureBatchName: String
  var currentItemNumber: Int
}

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
  @Published var authPassword = ""
  @Published var authError = ""
  @Published var statusMessage = "Ready"
  @Published var uploadMessage = ""

  @Published var isAuthenticated = false

  @Published var captureStoreName: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureStoreShortCode: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureBatchName: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var currentItemNumber: Int {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var currentItemSku = ""
  @Published var currentItemWeight = ""
  @Published var currentItemDimensions = ""
  @Published var currentItemNotes = ""
  @Published var capturedPhotos: [CapturedPhoto] = []

  private let userDefaults: UserDefaults
  private let captureContextStorageKey = "ebp.capture.context.v1"
  private var isApplyingPersistedCaptureContext = false

  var captureContextChipLabel: String {
    "\(captureStoreShortCode) · \(captureBatchName) · Item \(currentItemNumber)"
  }

  init(userDefaults: UserDefaults = .standard) {
    self.userDefaults = userDefaults
    let loaded = Self.loadCaptureContext(from: userDefaults, key: captureContextStorageKey)
    isApplyingPersistedCaptureContext = true
    captureStoreName = loaded.captureStoreName
    captureStoreShortCode = loaded.captureStoreShortCode
    captureBatchName = loaded.captureBatchName
    currentItemNumber = loaded.currentItemNumber
    isApplyingPersistedCaptureContext = false

    if Self.usesDevelopmentAuthBypass {
      isAuthenticated = true
      statusMessage = "Development auth bypass enabled."
      AppLog.auth.notice("Development auth bypass enabled")
    } else {
      AppLog.auth.notice("Development auth bypass disabled")
    }
  }

  func applyCaptureContext(
    storeName: String,
    storeShortCode: String,
    batchName: String,
    itemNumber: Int
  ) {
    isApplyingPersistedCaptureContext = true
    captureStoreName = Self.normalizeStoreName(storeName)
    captureStoreShortCode = Self.normalizeShortCode(
      storeShortCode,
      fallbackStoreName: captureStoreName
    )
    captureBatchName = Self.normalizeBatchName(batchName)
    currentItemNumber = Self.normalizeItemNumber(itemNumber)
    isApplyingPersistedCaptureContext = false
    saveCaptureContext()
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
    currentItemNumber = Self.normalizeItemNumber(currentItemNumber + 1)
    clearCurrentItem()
    statusMessage = "Moved to item \(currentItemNumber)"
  }

  private func persistCaptureContextIfNeeded() {
    guard !isApplyingPersistedCaptureContext else { return }

    isApplyingPersistedCaptureContext = true
    captureStoreName = Self.normalizeStoreName(captureStoreName)
    captureStoreShortCode = Self.normalizeShortCode(
      captureStoreShortCode,
      fallbackStoreName: captureStoreName
    )
    captureBatchName = Self.normalizeBatchName(captureBatchName)
    currentItemNumber = Self.normalizeItemNumber(currentItemNumber)
    isApplyingPersistedCaptureContext = false
    saveCaptureContext()
  }

  private func saveCaptureContext() {
    let payload = PersistedCaptureContext(
      captureStoreName: captureStoreName,
      captureStoreShortCode: captureStoreShortCode,
      captureBatchName: captureBatchName,
      currentItemNumber: currentItemNumber
    )
    if let data = try? JSONEncoder().encode(payload) {
      userDefaults.set(data, forKey: captureContextStorageKey)
    }
  }

  private static func loadCaptureContext(
    from defaults: UserDefaults,
    key: String
  ) -> PersistedCaptureContext {
    guard
      let data = defaults.data(forKey: key),
      let payload = try? JSONDecoder().decode(PersistedCaptureContext.self, from: data)
    else {
      return defaultCaptureContext()
    }

    let storeName = normalizeStoreName(payload.captureStoreName)
    return PersistedCaptureContext(
      captureStoreName: storeName,
      captureStoreShortCode: normalizeShortCode(
        payload.captureStoreShortCode,
        fallbackStoreName: storeName
      ),
      captureBatchName: normalizeBatchName(payload.captureBatchName),
      currentItemNumber: normalizeItemNumber(payload.currentItemNumber)
    )
  }

  private static func defaultCaptureContext() -> PersistedCaptureContext {
    let storeName = "Default Store"
    return PersistedCaptureContext(
      captureStoreName: storeName,
      captureStoreShortCode: "DEF",
      captureBatchName: "Current Batch",
      currentItemNumber: 1
    )
  }

  static func normalizeStoreName(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? defaultCaptureContext().captureStoreName : trimmed
  }

  static func normalizeBatchName(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? defaultCaptureContext().captureBatchName : trimmed
  }

  static func normalizeItemNumber(_ raw: Int) -> Int {
    max(raw, 1)
  }

  static func normalizeShortCode(_ raw: String, fallbackStoreName: String) -> String {
    let alnum = raw
      .uppercased()
      .filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
    let candidate = String(alnum.prefix(10))
    if candidate.count >= 2 {
      return candidate
    }

    let derived = derivedShortCode(from: fallbackStoreName)
    return derived.count >= 2 ? derived : "DEF"
  }

  private static func derivedShortCode(from storeName: String) -> String {
    let alnum = storeName.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
    let candidate = String(alnum.prefix(3))
    return candidate.isEmpty ? "DEF" : candidate
  }
}
