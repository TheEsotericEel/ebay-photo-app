import XCTest
@testable import EbayPhotoApp

@MainActor
final class AppStateCleanupTests: XCTestCase {
  private var suiteName: String!
  private var queueRootName: String!
  private var defaults: UserDefaults!

  override func setUp() {
    super.setUp()
    suiteName = "AppStateCleanupTests-\(UUID().uuidString)"
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

  func testSafeLocalCleanupOnlyTargetsSubmittedItemsAndLeavesRetryableItemsUntouched() {
    let state = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)

    state.addCapturedPhoto(makePhoto())

    state.advanceToNextItem()
    guard let submittedItemId = state.queuedItemPackets.first?.id else {
      XCTFail("Expected submitted candidate")
      return
    }
    let submittedPhotoId = state.queuedItemPackets[0].photos[0].id

    state.addCapturedPhoto(makePhoto())
    state.advanceToNextItem()
    guard state.queuedItemPackets.count == 2 else {
      XCTFail("Expected local candidate")
      return
    }
    let localItemId = state.queuedItemPackets[1].id

    state.addCapturedPhoto(makePhoto())
    state.advanceToNextItem()
    guard state.queuedItemPackets.count == 3 else {
      XCTFail("Expected failed candidate")
      return
    }
    let failedItemId = state.queuedItemPackets[2].id

    state.addCapturedPhoto(makePhoto())
    let currentDraftPhotoCount = state.capturedPhotos.count
    state.currentItemNotes = "Current draft note"

    state.markQueuedItemUploadAttemptStarted(itemId: submittedItemId)
    state.applyUploadResult(
      for: submittedItemId,
      result: NativeUploadItemPacketV1Result(
        storeId: "store-1",
        batchId: "batch-1",
        itemId: "item-1",
        photoIdByLocalPhotoId: [submittedPhotoId.uuidString: "remote-photo-1"],
        listingStorageKeys: [],
        thumbnailStorageKeys: []
      )
    )
    state.updateQueuedItemSubmitState(submittedItemId, state: .submitted)

    state.markQueuedItemUploadAttemptStarted(itemId: failedItemId)
    state.markQueuedItemUploadFailure(itemId: failedItemId, errorMessage: "Upload failed.")
    state.updateQueuedItemSubmitState(failedItemId, state: .failed, errorMessage: "Upload failed.")

    XCTAssertEqual(state.safeLocalCleanupCandidates().map(\.id), [submittedItemId])
    XCTAssertEqual(state.queueEligibleForSubmit().count, 2)

    XCTAssertEqual(state.clearSafeLocalPhotoCopies(), 1)
    XCTAssertEqual(state.queuedItemPackets[0].photos[0].uploadState, .cleared)
    XCTAssertEqual(state.queuedItemPackets[1].id, localItemId)
    XCTAssertEqual(state.queuedItemPackets[1].submitState, .local)
    XCTAssertEqual(state.queuedItemPackets[1].photos[0].uploadState, .local)
    XCTAssertEqual(state.queuedItemPackets[2].id, failedItemId)
    XCTAssertEqual(state.queuedItemPackets[2].submitState, .failed)
    XCTAssertEqual(state.queuedItemPackets[2].photos[0].uploadState, .failed)
    XCTAssertEqual(state.capturedPhotos.count, currentDraftPhotoCount)
    XCTAssertEqual(state.currentItemNotes, "Current draft note")
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
