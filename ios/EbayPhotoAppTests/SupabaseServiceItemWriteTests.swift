import XCTest
@testable import EbayPhotoApp

final class SupabaseServiceItemWriteTests: XCTestCase {
  func testCreateItemPayloadBodyIncludesListingStateFields() {
    let service = SupabaseService(userDefaults: UserDefaults(suiteName: #function)!, urlSession: .shared)
    let payload = service.makeNewItemPayload(
      workspaceId: "workspace-1",
      storeId: "store-1",
      batchId: "batch-1",
      item: .init(
        remoteId: nil,
        sequence: 12,
        status: "new",
        sku: "SKU-12",
        notes: "Fresh note",
        weight: "2 lb",
        dimensions: "10 x 8 x 6",
        listedAtISO8601: nil
      )
    )

    let body = service.createItemPayloadBody(payload)

    XCTAssertEqual(body["sequence"] as? Int, 12)
    XCTAssertEqual(body["status"] as? String, "new")
    XCTAssertEqual(body["sku"] as? String, "SKU-12")
    XCTAssertTrue(body.keys.contains("listed_at"))
    XCTAssertTrue(body.keys.contains("photo_retention_until"))
  }

  func testUpdateItemPayloadBodyOmitsRemoteListingStateFields() {
    let service = SupabaseService(userDefaults: UserDefaults(suiteName: #function)!, urlSession: .shared)
    let payload = service.makeExistingItemPayload(
      workspaceId: "workspace-1",
      storeId: "store-1",
      batchId: "batch-2",
      item: .init(
        remoteId: "remote-item-1",
        sequence: 5,
        status: "new",
        sku: "SKU-5",
        notes: "Updated note",
        weight: "1 lb",
        dimensions: "4 x 4 x 4",
        listedAtISO8601: "2026-05-30T12:00:00Z"
      )
    )

    let body = service.updateItemPayloadBody(payload)

    XCTAssertEqual(body["sequence"] as? Int, 5)
    XCTAssertEqual(body["notes"] as? String, "Updated note")
    XCTAssertFalse(body.keys.contains("status"))
    XCTAssertFalse(body.keys.contains("listed_at"))
    XCTAssertFalse(body.keys.contains("photo_retention_until"))
  }

  func testCreateItemConflictErrorMentionsBatchAndResolution() {
    let service = SupabaseService(userDefaults: UserDefaults(suiteName: #function)!, urlSession: .shared)

    let error = service.makeCreateItemConflictError(sequence: 7, batchName: "Batch A")

    XCTAssertEqual(
      error.errorDescription,
      "Item 7 already exists in batch \"Batch A\". Change the item number or re-open the existing queued item before submitting."
    )
  }
}
