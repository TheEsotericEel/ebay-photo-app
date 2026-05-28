import Combine
import Foundation
import ImageIO

private struct PersistedCaptureContext: Codable {
  var captureStoreName: String
  var captureStoreShortCode: String
  var captureBatchName: String
  var currentItemNumber: Int
  var captureStoreRemoteId: String?
  var captureBatchRemoteId: String?
}

@MainActor
final class AppState: ObservableObject {
  struct QueueSubmitProgress {
    var itemId: UUID?
    var itemNumber: Int?
    var stage: String
    var message: String
    var photoIndex: Int?
    var photoCount: Int?
  }

  enum QueueItemSubmitState: String, Codable {
    case local
    case submitting
    case submitted
    case failed
  }

  enum QueuePhotoUploadState: String, Codable {
    case local
    case uploading
    case uploaded
    case failed
    case verified
    case cleared
  }

  struct LocalQueuePhoto: Identifiable, Codable {
    let id: UUID
    let fileName: String
    let thumbnailFileName: String?
    let originalFileName: String?
    let lensLabel: String
    let capturedAt: Date
    var remotePhotoId: String?
    var uploadState: QueuePhotoUploadState
    var uploadAttemptCount: Int
    var lastUploadError: String?

    init(
      id: UUID,
      fileName: String,
      thumbnailFileName: String?,
      originalFileName: String? = nil,
      lensLabel: String,
      capturedAt: Date,
      remotePhotoId: String? = nil,
      uploadState: QueuePhotoUploadState = .local,
      uploadAttemptCount: Int = 0,
      lastUploadError: String? = nil
    ) {
      self.id = id
      self.fileName = fileName
      self.thumbnailFileName = thumbnailFileName
      self.originalFileName = originalFileName
      self.lensLabel = lensLabel
      self.capturedAt = capturedAt
      self.remotePhotoId = remotePhotoId
      self.uploadState = uploadState
      self.uploadAttemptCount = uploadAttemptCount
      self.lastUploadError = lastUploadError
    }

    enum CodingKeys: String, CodingKey {
      case id
      case fileName
      case thumbnailFileName
      case originalFileName
      case lensLabel
      case capturedAt
      case remotePhotoId
      case uploadState
      case uploadAttemptCount
      case lastUploadError
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      id = try container.decode(UUID.self, forKey: .id)
      fileName = try container.decode(String.self, forKey: .fileName)
      thumbnailFileName = try container.decodeIfPresent(String.self, forKey: .thumbnailFileName)
      originalFileName = try container.decodeIfPresent(String.self, forKey: .originalFileName)
      lensLabel = try container.decodeIfPresent(String.self, forKey: .lensLabel) ?? "Camera"
      capturedAt = try container.decodeIfPresent(Date.self, forKey: .capturedAt) ?? Date()
      remotePhotoId = try container.decodeIfPresent(String.self, forKey: .remotePhotoId)
      uploadState = try container.decodeIfPresent(QueuePhotoUploadState.self, forKey: .uploadState) ?? .local
      uploadAttemptCount = try container.decodeIfPresent(Int.self, forKey: .uploadAttemptCount) ?? 0
      lastUploadError = try container.decodeIfPresent(String.self, forKey: .lastUploadError)
    }
  }

  struct LocalQueueItemPacket: Identifiable, Codable {
    let id: UUID
    var itemNumber: Int
    var storeName: String
    var storeShortCode: String
    var storeRemoteId: String?
    var batchName: String
    var batchRemoteId: String?
    var remoteItemId: String?
    var sku: String
    var weight: String
    var dimensions: String
    var notes: String
    var photos: [LocalQueuePhoto]
    var submitState: QueueItemSubmitState
    var lastSubmitError: String?
    var submittedAt: Date?

    init(
      id: UUID,
      itemNumber: Int,
      storeName: String,
      storeShortCode: String,
      storeRemoteId: String?,
      batchName: String,
      batchRemoteId: String?,
      remoteItemId: String?,
      sku: String,
      weight: String,
      dimensions: String,
      notes: String,
      photos: [LocalQueuePhoto],
      submitState: QueueItemSubmitState,
      lastSubmitError: String?,
      submittedAt: Date?
    ) {
      self.id = id
      self.itemNumber = itemNumber
      self.storeName = storeName
      self.storeShortCode = storeShortCode
      self.storeRemoteId = storeRemoteId
      self.batchName = batchName
      self.batchRemoteId = batchRemoteId
      self.remoteItemId = remoteItemId
      self.sku = sku
      self.weight = weight
      self.dimensions = dimensions
      self.notes = notes
      self.photos = photos
      self.submitState = submitState
      self.lastSubmitError = lastSubmitError
      self.submittedAt = submittedAt
    }

    enum CodingKeys: String, CodingKey {
      case id
      case itemNumber
      case storeName
      case storeShortCode
      case storeRemoteId
      case batchName
      case batchRemoteId
      case remoteItemId
      case sku
      case weight
      case dimensions
      case notes
      case photos
      case submitState
      case lastSubmitError
      case submittedAt
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      id = try container.decode(UUID.self, forKey: .id)
      itemNumber = try container.decodeIfPresent(Int.self, forKey: .itemNumber) ?? 1
      storeName = try container.decodeIfPresent(String.self, forKey: .storeName) ?? "Default Store"
      storeShortCode = try container.decodeIfPresent(String.self, forKey: .storeShortCode) ?? "DEF"
      storeRemoteId = try container.decodeIfPresent(String.self, forKey: .storeRemoteId)
      batchName = try container.decodeIfPresent(String.self, forKey: .batchName) ?? "Current Batch"
      batchRemoteId = try container.decodeIfPresent(String.self, forKey: .batchRemoteId)
      remoteItemId = try container.decodeIfPresent(String.self, forKey: .remoteItemId)
      sku = try container.decodeIfPresent(String.self, forKey: .sku) ?? ""
      weight = try container.decodeIfPresent(String.self, forKey: .weight) ?? ""
      dimensions = try container.decodeIfPresent(String.self, forKey: .dimensions) ?? ""
      notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
      photos = try container.decodeIfPresent([LocalQueuePhoto].self, forKey: .photos) ?? []
      submitState = try container.decodeIfPresent(QueueItemSubmitState.self, forKey: .submitState) ?? .local
      lastSubmitError = try container.decodeIfPresent(String.self, forKey: .lastSubmitError)
      submittedAt = try container.decodeIfPresent(Date.self, forKey: .submittedAt)
    }
  }

  private struct PersistedDraftItem: Codable {
    var sku: String
    var weight: String
    var dimensions: String
    var notes: String
    var photos: [LocalQueuePhoto]
  }

  private struct PersistedQueueState: Codable {
    var queuedItems: [LocalQueueItemPacket]
    var draft: PersistedDraftItem?
  }

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
  @Published var queueSubmitProgress: QueueSubmitProgress?

  @Published var isAuthenticated = false

  @Published var captureStoreName: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureStoreShortCode: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureStoreRemoteId: String? {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureBatchName: String {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var captureBatchRemoteId: String? {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var currentItemNumber: Int {
    didSet { persistCaptureContextIfNeeded() }
  }

  @Published var currentItemSku = "" {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var currentItemWeight = "" {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var currentItemDimensions = "" {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var currentItemNotes = "" {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var capturedPhotos: [CapturedPhoto] = [] {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var queuedItemPackets: [LocalQueueItemPacket] = [] {
    didSet { persistQueueStateIfNeeded() }
  }
  @Published var remoteWorkspaceStores: [SupabaseService.WorkspaceStoreSummary] = []

  private let userDefaults: UserDefaults
  private let queueRootDirectoryName: String
  private let captureContextStorageKey = "ebp.capture.context.v1"
  private let queueStateFileName = "capture-queue-state-v1.json"
  private let queuePhotosDirectoryName = "capture-queue-photos"
  private var isApplyingPersistedCaptureContext = false
  private var isApplyingPersistedQueueState = false

  var captureContextChipLabel: String {
    "\(captureStoreShortCode) · \(captureBatchName) · Item \(currentItemNumber)"
  }

  init(
    userDefaults: UserDefaults = .standard,
    queueRootDirectoryName: String = "capture-queue-v1"
  ) {
    self.userDefaults = userDefaults
    self.queueRootDirectoryName = queueRootDirectoryName
    let loaded = Self.loadCaptureContext(from: userDefaults, key: captureContextStorageKey)
    isApplyingPersistedCaptureContext = true
    captureStoreName = loaded.captureStoreName
    captureStoreShortCode = loaded.captureStoreShortCode
    captureStoreRemoteId = loaded.captureStoreRemoteId
    captureBatchName = loaded.captureBatchName
    captureBatchRemoteId = loaded.captureBatchRemoteId
    currentItemNumber = loaded.currentItemNumber
    isApplyingPersistedCaptureContext = false

    restoreQueueState()

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

  func applyRemoteWorkspaceContext(
    storeId: String,
    batchId: String,
    storeName: String,
    storeShortCode: String,
    batchName: String
  ) {
    isApplyingPersistedCaptureContext = true
    captureStoreRemoteId = storeId
    captureBatchRemoteId = batchId
    captureStoreName = Self.normalizeStoreName(storeName)
    captureStoreShortCode = Self.normalizeShortCode(
      storeShortCode,
      fallbackStoreName: captureStoreName
    )
    captureBatchName = Self.normalizeBatchName(batchName)
    isApplyingPersistedCaptureContext = false
    saveCaptureContext()
  }

  func mergeRemoteWorkspaceSnapshot(_ snapshot: SupabaseService.WorkspaceSnapshot) {
    remoteWorkspaceStores = snapshot.stores

    guard let matchingStore = resolveMatchingRemoteStore(from: snapshot) else {
      return
    }

    isApplyingPersistedCaptureContext = true
    captureStoreRemoteId = matchingStore.id
    captureStoreName = Self.normalizeStoreName(matchingStore.name)
    captureStoreShortCode = Self.normalizeShortCode(
      matchingStore.shortCode,
      fallbackStoreName: matchingStore.name
    )

    if let matchingBatch = resolveMatchingRemoteBatch(in: matchingStore) {
      captureBatchRemoteId = matchingBatch.id
      captureBatchName = Self.normalizeBatchName(matchingBatch.name)
    }

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

  func clearCurrentItem(deleteDraftPhotoAssets: Bool = true) {
    if deleteDraftPhotoAssets {
      for photo in capturedPhotos {
        deletePhotoAssetFiles(for: photo.id)
      }
    }
    currentItemSku = ""
    currentItemWeight = ""
    currentItemDimensions = ""
    currentItemNotes = ""
    capturedPhotos = []
  }

  func undoLastCapture() {
    guard let removed = capturedPhotos.last else {
      statusMessage = "Nothing to undo."
      return
    }

    capturedPhotos.removeLast()
    deletePhotoAssetFiles(for: removed.id)
    statusMessage = "Removed the most recent capture."
  }

  func addCapturedPhoto(_ photo: CapturedPhoto) {
    do {
      try savePhotoAssetFiles(for: photo)
      capturedPhotos.append(photo)
      statusMessage = "Captured \(capturedPhotos.count) photo(s)"
    } catch {
      statusMessage = "Capture saved in memory only: \(error.localizedDescription)"
      capturedPhotos.append(photo)
    }
  }

  var hasCurrentDraftContent: Bool {
    !capturedPhotos.isEmpty
      || !currentItemSku.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !currentItemWeight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !currentItemDimensions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      || !currentItemNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  @discardableResult
  func enqueueCurrentItemIfNeeded() -> Bool {
    guard !capturedPhotos.isEmpty else { return false }

    let queuePhotos = capturedPhotos.map { photo in
      LocalQueuePhoto(
        id: photo.id,
        fileName: listingFileName(for: photo.id),
        thumbnailFileName: photo.thumbnailData == nil ? nil : thumbnailFileName(for: photo.id),
        originalFileName: photo.originalData == nil ? nil : originalFileName(for: photo.id),
        lensLabel: photo.lensLabel,
        capturedAt: photo.capturedAt
      )
    }

    let queued = LocalQueueItemPacket(
      id: UUID(),
      itemNumber: currentItemNumber,
      storeName: captureStoreName,
      storeShortCode: captureStoreShortCode,
      storeRemoteId: captureStoreRemoteId,
      batchName: captureBatchName,
      batchRemoteId: captureBatchRemoteId,
      remoteItemId: nil,
      sku: currentItemSku,
      weight: currentItemWeight,
      dimensions: currentItemDimensions,
      notes: currentItemNotes,
      photos: queuePhotos,
      submitState: .local,
      lastSubmitError: nil,
      submittedAt: nil
    )

    queuedItemPackets.append(queued)
    return true
  }

  func queueEligibleForSubmit() -> [LocalQueueItemPacket] {
    queuedItemPackets.filter { item in
      !item.photos.isEmpty && (item.submitState == .local || item.submitState == .failed)
    }
  }

  func safeLocalCleanupCandidates() -> [LocalQueueItemPacket] {
    queuedItemPackets.filter { item in
      item.submitState == .submitted
        && !item.photos.isEmpty
        && item.photos.allSatisfy { photo in
          photo.uploadState == .uploaded || photo.uploadState == .verified || photo.uploadState == .cleared
        }
    }
  }

  func updateQueuedItemSubmitState(
    _ itemId: UUID,
    state: QueueItemSubmitState,
    errorMessage: String? = nil
  ) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].submitState = state
    queuedItemPackets[index].lastSubmitError = errorMessage
    queuedItemPackets[index].submittedAt = state == .submitted ? Date() : queuedItemPackets[index].submittedAt
  }

  func applyUploadResult(
    for itemId: UUID,
    result: NativeUploadItemPacketV1Result
  ) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].storeRemoteId = result.storeId
    queuedItemPackets[index].batchRemoteId = result.batchId
    queuedItemPackets[index].remoteItemId = result.itemId
    queuedItemPackets[index].lastSubmitError = nil

    for photoIndex in queuedItemPackets[index].photos.indices {
      let localPhotoUUID = queuedItemPackets[index].photos[photoIndex].id.uuidString
      if let remotePhotoId = result.photoIdByLocalPhotoId[localPhotoUUID] {
        queuedItemPackets[index].photos[photoIndex].remotePhotoId = remotePhotoId
        queuedItemPackets[index].photos[photoIndex].uploadState = .uploaded
        queuedItemPackets[index].photos[photoIndex].lastUploadError = nil
      }
    }
  }

  func markQueuedItemUploadFailure(
    itemId: UUID,
    errorMessage: String
  ) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].lastSubmitError = errorMessage
    for photoIndex in queuedItemPackets[index].photos.indices {
      let state = queuedItemPackets[index].photos[photoIndex].uploadState
      if state == .local || state == .uploading {
        queuedItemPackets[index].photos[photoIndex].uploadState = .failed
        queuedItemPackets[index].photos[photoIndex].lastUploadError = errorMessage
      }
    }
  }

  func markQueuedItemUploadAttemptStarted(itemId: UUID) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    for photoIndex in queuedItemPackets[index].photos.indices {
      queuedItemPackets[index].photos[photoIndex].uploadAttemptCount += 1
      queuedItemPackets[index].photos[photoIndex].lastUploadError = nil
      if queuedItemPackets[index].photos[photoIndex].uploadState != .uploaded
        && queuedItemPackets[index].photos[photoIndex].uploadState != .verified
        && queuedItemPackets[index].photos[photoIndex].uploadState != .cleared {
        queuedItemPackets[index].photos[photoIndex].uploadState = .uploading
      }
    }
  }

  func setQueueSubmitProgress(
    itemId: UUID?,
    itemNumber: Int?,
    stage: String,
    message: String,
    photoIndex: Int? = nil,
    photoCount: Int? = nil
  ) {
    queueSubmitProgress = QueueSubmitProgress(
      itemId: itemId,
      itemNumber: itemNumber,
      stage: stage,
      message: message,
      photoIndex: photoIndex,
      photoCount: photoCount
    )
  }

  func clearQueueSubmitProgress() {
    queueSubmitProgress = nil
  }

  func queuedItemPacket(id: UUID) -> LocalQueueItemPacket? {
    queuedItemPackets.first(where: { $0.id == id })
  }

  func updateQueuedItemMetadata(
    itemId: UUID,
    sku: String,
    weight: String,
    dimensions: String,
    notes: String
  ) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].sku = sku
    queuedItemPackets[index].weight = weight
    queuedItemPackets[index].dimensions = dimensions
    queuedItemPackets[index].notes = notes
    if queuedItemPackets[index].submitState == .submitted {
      queuedItemPackets[index].submitState = .local
      queuedItemPackets[index].submittedAt = nil
    }
  }

  func updateQueuedItemContext(
    itemId: UUID,
    storeName: String,
    storeShortCode: String,
    batchName: String
  ) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].storeName = Self.normalizeStoreName(storeName)
    queuedItemPackets[index].storeShortCode = Self.normalizeShortCode(
      storeShortCode,
      fallbackStoreName: queuedItemPackets[index].storeName
    )
    queuedItemPackets[index].batchName = Self.normalizeBatchName(batchName)
    queuedItemPackets[index].storeRemoteId = nil
    queuedItemPackets[index].batchRemoteId = nil
    if queuedItemPackets[index].submitState == .submitted {
      queuedItemPackets[index].submitState = .local
      queuedItemPackets[index].submittedAt = nil
    }
  }

  func markQueuedItemForResubmit(itemId: UUID) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    queuedItemPackets[index].submitState = .local
    queuedItemPackets[index].submittedAt = nil
    queuedItemPackets[index].lastSubmitError = nil
  }

  @discardableResult
  func clearSafeLocalPhotoCopies() -> Int {
    var cleared = 0
    let candidateIds = Set(safeLocalCleanupCandidates().map { $0.id })
    for itemIndex in queuedItemPackets.indices {
      guard candidateIds.contains(queuedItemPackets[itemIndex].id) else { continue }
      for photoIndex in queuedItemPackets[itemIndex].photos.indices {
        let photo = queuedItemPackets[itemIndex].photos[photoIndex]
        if photo.uploadState == .cleared {
          continue
        }
        deletePhotoAssetFiles(for: photo.id)
        queuedItemPackets[itemIndex].photos[photoIndex].uploadState = .cleared
        queuedItemPackets[itemIndex].photos[photoIndex].lastUploadError = nil
        cleared += 1
      }
    }
    return cleared
  }

  func removeQueuedPhoto(itemId: UUID, photoId: UUID) {
    guard let itemIndex = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    guard let photoIndex = queuedItemPackets[itemIndex].photos.firstIndex(where: { $0.id == photoId }) else { return }
    let removedPhoto = queuedItemPackets[itemIndex].photos.remove(at: photoIndex)
    deletePhotoAssetFiles(for: removedPhoto.id)
  }

  func removeQueuedItem(itemId: UUID) {
    removeQueuedItem(itemId: itemId, deletePhotoAssets: true)
  }

  func removeQueuedItemPreservingPhotoAssets(itemId: UUID) {
    removeQueuedItem(itemId: itemId, deletePhotoAssets: false)
  }

  @discardableResult
  func promoteQueuedItemToDraft(itemId: UUID) -> Bool {
    guard let item = queuedItemPacket(id: itemId) else { return false }
    let restoredPhotos: [CapturedPhoto] = item.photos.compactMap { photo in
      guard let listingData = try? loadPhotoBytes(fileName: photo.fileName) else {
        return nil
      }
      let thumbData: Data?
      if let thumbName = photo.thumbnailFileName {
        thumbData = try? loadPhotoBytes(fileName: thumbName)
      } else {
        thumbData = nil
      }
      return CapturedPhoto(
        id: photo.id,
        data: listingData,
        thumbnailData: thumbData,
        lensLabel: photo.lensLabel,
        capturedAt: photo.capturedAt
      )
    }

    guard !restoredPhotos.isEmpty else { return false }

    clearCurrentItem()
    applyCaptureContext(
      storeName: item.storeName,
      storeShortCode: item.storeShortCode,
      batchName: item.batchName,
      itemNumber: item.itemNumber
    )
    captureStoreRemoteId = item.storeRemoteId
    captureBatchRemoteId = item.batchRemoteId
    currentItemNumber = item.itemNumber
    currentItemSku = item.sku
    currentItemWeight = item.weight
    currentItemDimensions = item.dimensions
    currentItemNotes = item.notes
    capturedPhotos = restoredPhotos
    removeQueuedItem(itemId: itemId, deletePhotoAssets: false)
    statusMessage = "Loaded item \(item.itemNumber) into draft."
    return true
  }

  func queuedPhotoPreviewData(itemId: UUID, photoId: UUID) -> Data? {
    guard let item = queuedItemPacket(id: itemId) else { return nil }
    guard let photo = item.photos.first(where: { $0.id == photoId }) else { return nil }
    if let thumbName = photo.thumbnailFileName,
       let thumbData = try? loadPhotoBytes(fileName: thumbName) {
      return thumbData
    }
    return try? loadPhotoBytes(fileName: photo.fileName)
  }

  func makeUploadPacket(from queuedItem: LocalQueueItemPacket) throws -> NativeUploadItemPacketV1 {
    let formatter = ISO8601DateFormatter()

    let photos = try queuedItem.photos.enumerated().map { index, photo in
      let listingBytes = try loadPhotoBytes(fileName: photo.fileName)
      let listingSize = jpegPixelSize(listingBytes)
      let thumbnailBytes: Data
      if let thumbnailFileName = photo.thumbnailFileName {
        thumbnailBytes = (try? loadPhotoBytes(fileName: thumbnailFileName)) ?? listingBytes
      } else {
        thumbnailBytes = listingBytes
      }
      let thumbnailSize = jpegPixelSize(thumbnailBytes)
      let originalBytes: Data?
      if let originalFileName = photo.originalFileName {
        originalBytes = try? loadPhotoBytes(fileName: originalFileName)
      } else {
        originalBytes = nil
      }
      let originalSize = originalBytes.flatMap { jpegPixelSize($0) }
      let originalPayload: NativeUploadItemPacketV1.VariantPayload? = {
        guard let originalBytes, originalBytes.count > listingBytes.count else { return nil }
        return .init(
          bytes: originalBytes,
          mimeType: "image/jpeg",
          width: originalSize?.width,
          height: originalSize?.height
        )
      }()

      return NativeUploadItemPacketV1.Photo(
        localPhotoId: photo.id.uuidString,
        remotePhotoId: photo.remotePhotoId,
        orderIndex: index,
        capturedAtISO8601: formatter.string(from: photo.capturedAt),
        listing: .init(
          bytes: listingBytes,
          mimeType: "image/jpeg",
          width: listingSize?.width,
          height: listingSize?.height
        ),
        thumbnail: .init(
          bytes: thumbnailBytes,
          mimeType: "image/jpeg",
          width: thumbnailSize?.width,
          height: thumbnailSize?.height
        ),
        original: originalPayload
      )
    }

    return NativeUploadItemPacketV1(
      store: .init(
        shortCode: queuedItem.storeShortCode,
        name: queuedItem.storeName,
        remoteId: queuedItem.storeRemoteId
      ),
      batch: .init(
        name: queuedItem.batchName,
        status: "active",
        remoteId: queuedItem.batchRemoteId
      ),
      item: .init(
        remoteId: queuedItem.remoteItemId,
        sequence: queuedItem.itemNumber,
        status: "new",
        sku: queuedItem.sku.nonEmpty,
        notes: queuedItem.notes.nonEmpty,
        weight: queuedItem.weight.nonEmpty,
        dimensions: queuedItem.dimensions.nonEmpty,
        listedAtISO8601: nil
      ),
      photos: photos
    )
  }

  private func removeQueuedItem(itemId: UUID, deletePhotoAssets: Bool) {
    guard let index = queuedItemPackets.firstIndex(where: { $0.id == itemId }) else { return }
    let removed = queuedItemPackets.remove(at: index)
    if deletePhotoAssets {
      for photo in removed.photos {
        deletePhotoAssetFiles(for: photo.id)
      }
    }
  }

  func advanceToNextItem() {
    _ = enqueueCurrentItemIfNeeded()
    currentItemNumber = Self.normalizeItemNumber(currentItemNumber + 1)
    clearCurrentItem(deleteDraftPhotoAssets: false)
    statusMessage = "Moved to item \(currentItemNumber)"
  }

  private func persistQueueStateIfNeeded() {
    guard !isApplyingPersistedQueueState else { return }
    persistQueueState()
  }

  private func restoreQueueState() {
    isApplyingPersistedQueueState = true
    defer { isApplyingPersistedQueueState = false }

    guard
      let stateURL = try? queueStateFileURL(),
      let data = try? Data(contentsOf: stateURL),
      let persisted = try? JSONDecoder().decode(PersistedQueueState.self, from: data)
    else {
      return
    }

    queuedItemPackets = persisted.queuedItems
    if let draft = persisted.draft {
      currentItemSku = draft.sku
      currentItemWeight = draft.weight
      currentItemDimensions = draft.dimensions
      currentItemNotes = draft.notes
      capturedPhotos = draft.photos.compactMap { restoreCapturedPhoto(from: $0) }
    }
  }

  private func persistQueueState() {
    let draft: PersistedDraftItem? = hasCurrentDraftContent
      ? PersistedDraftItem(
          sku: currentItemSku,
          weight: currentItemWeight,
          dimensions: currentItemDimensions,
          notes: currentItemNotes,
          photos: capturedPhotos.map { photo in
            LocalQueuePhoto(
              id: photo.id,
              fileName: listingFileName(for: photo.id),
              thumbnailFileName: photo.thumbnailData == nil ? nil : thumbnailFileName(for: photo.id),
              originalFileName: photo.originalData == nil ? nil : originalFileName(for: photo.id),
              lensLabel: photo.lensLabel,
              capturedAt: photo.capturedAt
            )
          }
        )
      : nil

    let state = PersistedQueueState(
      queuedItems: queuedItemPackets,
      draft: draft
    )

    do {
      let data = try JSONEncoder().encode(state)
      let url = try queueStateFileURL()
      try data.write(to: url, options: .atomic)
    } catch {
      AppLog.camera.error("Queue state persistence failed error=\(error.localizedDescription, privacy: .public)")
    }
  }

  private func restoreCapturedPhoto(from persisted: LocalQueuePhoto) -> CapturedPhoto? {
    guard let listingData = try? loadPhotoBytes(fileName: persisted.fileName) else {
      return nil
    }
    let thumbData: Data?
    if let thumbName = persisted.thumbnailFileName {
      thumbData = try? loadPhotoBytes(fileName: thumbName)
    } else {
      thumbData = nil
    }

    return CapturedPhoto(
      id: persisted.id,
      data: listingData,
      thumbnailData: thumbData,
      originalData: persisted.originalFileName.flatMap { try? loadPhotoBytes(fileName: $0) },
      lensLabel: persisted.lensLabel,
      capturedAt: persisted.capturedAt
    )
  }

  private func savePhotoAssetFiles(for photo: CapturedPhoto) throws {
    let directory = try queuePhotosDirectoryURL()
    let listingURL = directory.appendingPathComponent(listingFileName(for: photo.id))
    try photo.data.write(to: listingURL, options: .atomic)
    if let thumbnailData = photo.thumbnailData {
      let thumbURL = directory.appendingPathComponent(thumbnailFileName(for: photo.id))
      try thumbnailData.write(to: thumbURL, options: .atomic)
    }
    if let originalData = photo.originalData {
      let originalURL = directory.appendingPathComponent(originalFileName(for: photo.id))
      try originalData.write(to: originalURL, options: .atomic)
    }
  }

  private func deletePhotoAssetFiles(for photoId: UUID) {
    let fm = FileManager.default
    guard let directory = try? queuePhotosDirectoryURL() else { return }
    let listingURL = directory.appendingPathComponent(listingFileName(for: photoId))
    let thumbURL = directory.appendingPathComponent(thumbnailFileName(for: photoId))
    let originalURL = directory.appendingPathComponent(originalFileName(for: photoId))
    if fm.fileExists(atPath: listingURL.path) {
      try? fm.removeItem(at: listingURL)
    }
    if fm.fileExists(atPath: thumbURL.path) {
      try? fm.removeItem(at: thumbURL)
    }
    if fm.fileExists(atPath: originalURL.path) {
      try? fm.removeItem(at: originalURL)
    }
  }

  private func loadPhotoBytes(fileName: String) throws -> Data {
    let fileURL = try queuePhotosDirectoryURL().appendingPathComponent(fileName)
    return try Data(contentsOf: fileURL)
  }

  private func queueStateFileURL() throws -> URL {
    try queueRootDirectoryURL().appendingPathComponent(queueStateFileName)
  }

  private func queuePhotosDirectoryURL() throws -> URL {
    let directory = try queueRootDirectoryURL().appendingPathComponent(queuePhotosDirectoryName, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func queueRootDirectoryURL() throws -> URL {
    let fm = FileManager.default
    let appSupport = try fm.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let queueRoot = appSupport.appendingPathComponent(queueRootDirectoryName, isDirectory: true)
    try fm.createDirectory(at: queueRoot, withIntermediateDirectories: true)
    return queueRoot
  }

  private func listingFileName(for photoId: UUID) -> String {
    "\(photoId.uuidString.lowercased()).jpg"
  }

  private func thumbnailFileName(for photoId: UUID) -> String {
    "\(photoId.uuidString.lowercased())-thumb.jpg"
  }

  private func originalFileName(for photoId: UUID) -> String {
    "\(photoId.uuidString.lowercased())-original.jpg"
  }

  private func jpegPixelSize(_ data: Data) -> (width: Int, height: Int)? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int else {
      return nil
    }
    return (width, height)
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

  private func resolveMatchingRemoteStore(
    from snapshot: SupabaseService.WorkspaceSnapshot
  ) -> SupabaseService.WorkspaceStoreSummary? {
    if let captureStoreRemoteId, let store = snapshot.stores.first(where: { $0.id == captureStoreRemoteId }) {
      return store
    }

    let normalizedShortCode = Self.normalizeShortCode(
      captureStoreShortCode,
      fallbackStoreName: captureStoreName
    )
    if let store = snapshot.stores.first(where: { $0.shortCode == normalizedShortCode }) {
      return store
    }

    return snapshot.stores.first(where: {
      Self.normalizeStoreName($0.name) == Self.normalizeStoreName(captureStoreName)
    })
  }

  private func resolveMatchingRemoteBatch(
    in store: SupabaseService.WorkspaceStoreSummary
  ) -> SupabaseService.WorkspaceBatchSummary? {
    if let captureBatchRemoteId, let batch = store.batches.first(where: { $0.id == captureBatchRemoteId }) {
      return batch
    }

    return store.batches.first(where: {
      Self.normalizeBatchName($0.name) == Self.normalizeBatchName(captureBatchName)
    }) ?? store.batches.first
  }

  private func saveCaptureContext() {
    let payload = PersistedCaptureContext(
      captureStoreName: captureStoreName,
      captureStoreShortCode: captureStoreShortCode,
      captureBatchName: captureBatchName,
      currentItemNumber: currentItemNumber,
      captureStoreRemoteId: captureStoreRemoteId,
      captureBatchRemoteId: captureBatchRemoteId
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
      currentItemNumber: normalizeItemNumber(payload.currentItemNumber),
      captureStoreRemoteId: payload.captureStoreRemoteId,
      captureBatchRemoteId: payload.captureBatchRemoteId
    )
  }

  private static func defaultCaptureContext() -> PersistedCaptureContext {
    let storeName = "Default Store"
    return PersistedCaptureContext(
      captureStoreName: storeName,
      captureStoreShortCode: "DEF",
      captureBatchName: "Current Batch",
      currentItemNumber: 1,
      captureStoreRemoteId: nil,
      captureBatchRemoteId: nil
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

private extension String {
  var nonEmpty: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
