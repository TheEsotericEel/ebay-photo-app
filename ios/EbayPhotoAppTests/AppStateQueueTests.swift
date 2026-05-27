import XCTest
@testable import EbayPhotoApp

@MainActor
final class AppStateQueueTests: XCTestCase {
  private var suiteName: String!
  private var queueRootName: String!
  private var defaults: UserDefaults!

  override func setUp() {
    super.setUp()
    suiteName = "AppStateQueueTests-\(UUID().uuidString)"
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

  func testAdvanceToNextItemEnqueuesDraft() {
    let state = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)
    state.currentItemSku = "SKU-1"
    state.currentItemWeight = "2.4 lb"
    state.currentItemDimensions = "8 x 10 in"
    state.currentItemNotes = "Small scratch on back cover."
    state.addCapturedPhoto(makePhoto())

    state.advanceToNextItem()

    XCTAssertEqual(state.queuedItemPackets.count, 1)
    XCTAssertEqual(state.queuedItemPackets.first?.itemNumber, 1)
    XCTAssertEqual(state.queuedItemPackets.first?.sku, "SKU-1")
    XCTAssertEqual(state.queuedItemPackets.first?.weight, "2.4 lb")
    XCTAssertEqual(state.queuedItemPackets.first?.dimensions, "8 x 10 in")
    XCTAssertEqual(state.queuedItemPackets.first?.notes, "Small scratch on back cover.")
    XCTAssertEqual(state.currentItemNumber, 2)
    XCTAssertTrue(state.capturedPhotos.isEmpty)
  }

  func testSubmittedItemsAreEligibleForSafeCleanup() {
    let state = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)
    state.addCapturedPhoto(makePhoto())
    state.advanceToNextItem()
    guard let queuedId = state.queuedItemPackets.first?.id else {
      XCTFail("Expected queued item")
      return
    }

    state.updateQueuedItemSubmitState(queuedId, state: .submitted)
    state.markQueuedItemUploadAttemptStarted(itemId: queuedId)
    let result = NativeUploadItemPacketV1Result(
      storeId: "store-1",
      batchId: "batch-1",
      itemId: "item-1",
      photoIdByLocalPhotoId: [state.queuedItemPackets[0].photos[0].id.uuidString: "photo-1"],
      listingStorageKeys: [],
      thumbnailStorageKeys: []
    )
    state.applyUploadResult(for: queuedId, result: result)

    XCTAssertEqual(state.safeLocalCleanupCandidates().count, 1)
    XCTAssertEqual(state.clearSafeLocalPhotoCopies(), 1)
    XCTAssertEqual(state.queuedItemPackets[0].photos[0].uploadState, .cleared)
  }

  private func makePhoto() -> CapturedPhoto {
    CapturedPhoto(
      data: Data([1, 2, 3, 4]),
      thumbnailData: Data([9, 9]),
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
