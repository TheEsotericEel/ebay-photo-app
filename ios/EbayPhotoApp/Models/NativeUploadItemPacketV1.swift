import Foundation

typealias SupabaseItemStatus = String

struct NativeUploadItemPacketV1 {
  struct Store {
    let shortCode: String
    let name: String
    let remoteId: String?
  }

  struct Batch {
    let name: String
    let status: String
    let remoteId: String?
  }

  struct Item {
    let remoteId: String?
    let sequence: Int
    let status: SupabaseItemStatus
    let sku: String?
    let notes: String?
    let weight: String?
    let dimensions: String?
    let listedAtISO8601: String?
  }

  struct VariantPayload {
    let bytes: Data
    let mimeType: String
    let width: Int?
    let height: Int?
  }

  struct Photo {
    let localPhotoId: String
    let remotePhotoId: String?
    let orderIndex: Int
    let capturedAtISO8601: String
    let listing: VariantPayload
    let thumbnail: VariantPayload
    let original: VariantPayload?
  }

  let store: Store
  let batch: Batch
  let item: Item
  let photos: [Photo]
}

struct NativeUploadItemPacketV1Result {
  let storeId: String
  let batchId: String
  let itemId: String
  let photoIdByLocalPhotoId: [String: String]
  let listingStorageKeys: [String]
  let thumbnailStorageKeys: [String]
}

