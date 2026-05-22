import XCTest
@testable import EbayPhotoApp

@MainActor
final class AppStatePersistenceTests: XCTestCase {
  private var suiteName: String!
  private var queueRootName: String!
  private var defaults: UserDefaults!

  override func setUp() {
    super.setUp()
    suiteName = "AppStatePersistenceTests-\(UUID().uuidString)"
    queueRootName = "capture-queue-tests-\(suiteName!)"
    defaults = UserDefaults(suiteName: suiteName)
    defaults.removePersistentDomain(forName: suiteName)
    removeQueueRootDirectory()
  }

  override func tearDown() {
    defaults.removePersistentDomain(forName: suiteName)
    removeQueueRootDirectory()
    super.tearDown()
  }

  func testQueueAndDraftRestoreAcrossAppStateInit() {
    let first = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)
    first.currentItemSku = "QUEUED"
    first.addCapturedPhoto(makePhoto())
    first.advanceToNextItem()
    first.currentItemSku = "DRAFT"
    first.addCapturedPhoto(makePhoto())

    let restored = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)

    XCTAssertEqual(restored.queuedItemPackets.count, 1)
    XCTAssertEqual(restored.queuedItemPackets.first?.sku, "QUEUED")
    XCTAssertEqual(restored.currentItemSku, "DRAFT")
    XCTAssertEqual(restored.capturedPhotos.count, 1)
  }

  private func makePhoto() -> CapturedPhoto {
    CapturedPhoto(
      data: Data([4, 3, 2, 1]),
      thumbnailData: Data([8, 8]),
      lensLabel: "1x",
      capturedAt: Date()
    )
  }

  private func removeQueueRootDirectory() {
    let fm = FileManager.default
    guard
      let appSupport = try? fm.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
    else { return }
    let queueRoot = appSupport.appendingPathComponent(queueRootName, isDirectory: true)
    try? fm.removeItem(at: queueRoot)
  }
}
