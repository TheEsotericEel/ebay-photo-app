import XCTest
@testable import EbayPhotoApp

@MainActor
final class UploadIdempotencyTests: XCTestCase {
  private var suiteName: String!
  private var queueRootName: String!
  private var defaults: UserDefaults!

  override func setUp() {
    super.setUp()
    suiteName = "UploadIdempotencyTests-\(UUID().uuidString)"
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

  func testMakeUploadPacketReusesPersistedRemoteIds() throws {
    let state = AppState(userDefaults: defaults, queueRootDirectoryName: queueRootName)
    state.captureStoreName = "Store One"
    state.captureStoreShortCode = "S1"
    state.captureBatchName = "Batch One"
    state.captureStoreRemoteId = "store-remote-1"
    state.captureBatchRemoteId = "batch-remote-1"
    state.addCapturedPhoto(makePhoto())
    state.advanceToNextItem()

    guard var item = state.queuedItemPackets.first else {
      XCTFail("Expected queued item")
      return
    }

    item.remoteItemId = "item-remote-1"
    item.photos[0].remotePhotoId = "photo-remote-1"
    state.queuedItemPackets[0] = item

    let packet = try state.makeUploadPacket(from: item)

    XCTAssertEqual(packet.store.remoteId, "store-remote-1")
    XCTAssertEqual(packet.batch.remoteId, "batch-remote-1")
    XCTAssertEqual(packet.item.remoteId, "item-remote-1")
    XCTAssertEqual(packet.photos.first?.remotePhotoId, "photo-remote-1")
  }

  private func makePhoto() -> CapturedPhoto {
    CapturedPhoto(
      data: Data([7, 7, 7, 7]),
      thumbnailData: Data([3, 3]),
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
