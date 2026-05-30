import UIKit
import XCTest
@testable import EbayPhotoApp

final class SupabaseServiceLiveHandoffTests: XCTestCase {
  private struct AuthResponse: Decodable {
    let access_token: String
  }

  private struct RemoteItemRow: Decodable {
    let id: String
    let status: String?
    let listed_at: String?
    let photo_retention_until: String?
    let notes: String?
    let weight: String?
  }

  override func setUp() {
    super.setUp()
    continueAfterFailure = false
  }

  func testLiveUploadPreservesRemoteListingStateAndRejectsDuplicateCreate() async throws {
    guard ProcessInfo.processInfo.environment["RUN_LIVE_IOS_HANDOFF"] == "1" else {
      throw XCTSkip("Set RUN_LIVE_IOS_HANDOFF=1 to run the live iOS handoff verification.")
    }

    let appBundle = Bundle(for: SupabaseService.self)
    guard
      let rawURL = appBundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
      let rawAnonKey = appBundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String
    else {
      XCTFail("Missing Supabase config in app bundle.")
      return
    }

    let email = ProcessInfo.processInfo.environment["DEV_EMAIL"] ?? "the.esoteric.eel@gmail.com"
    let password = ProcessInfo.processInfo.environment["DEV_PASSWORD"] ?? "password"
    let baseURL = try XCTUnwrap(URL(string: rawURL.trimmingCharacters(in: .whitespacesAndNewlines)))
    let anonKey = rawAnonKey.trimmingCharacters(in: .whitespacesAndNewlines)
    let session = URLSession(configuration: .ephemeral)
    let serviceDefaults = UserDefaults(suiteName: "SupabaseServiceLiveHandoffTests-\(UUID().uuidString)")!
    let service = SupabaseService(userDefaults: serviceDefaults, urlSession: session)

    appendLog("LIVE_VERIFY start email=\(email) baseURL=\(baseURL.absoluteString)")

    try await service.signInWithPassword(email: email, password: password)
    let accessToken = try await fetchAccessToken(
      baseURL: baseURL,
      anonKey: anonKey,
      email: email,
      password: password,
      session: session
    )

    let batchName = "Live Handoff \(UUID().uuidString.prefix(8))"
    let itemSequence = Int.random(in: 500_000...599_999)
    let firstPhoto = makePhoto(orderIndex: 0, color: .systemBlue)

    let createPacket = NativeUploadItemPacketV1(
      store: .init(shortCode: "DEF", name: "Default Store", remoteId: nil),
      batch: .init(name: batchName, status: "active", remoteId: nil),
      item: .init(
        remoteId: nil,
        sequence: itemSequence,
        status: "new",
        sku: "live-\(itemSequence)",
        notes: "live initial note",
        weight: "1 lb",
        dimensions: "10 x 8 x 6 in",
        listedAtISO8601: nil
      ),
      photos: [firstPhoto]
    )

    let createResult = try await service.uploadItemPacket(createPacket)
    appendLog("LIVE_VERIFY create itemId=\(createResult.itemId) batchId=\(createResult.batchId) storeId=\(createResult.storeId)")

    let listedAt = ISO8601DateFormatter().string(from: Date())
    let retentionUntil = ISO8601DateFormatter().string(from: Date().addingTimeInterval(7 * 24 * 60 * 60))
    try await patchRemoteItemState(
      baseURL: baseURL,
      anonKey: anonKey,
      accessToken: accessToken,
      itemId: createResult.itemId,
      status: "listed",
      listedAt: listedAt,
      retentionUntil: retentionUntil,
      notes: "desktop note",
      weight: "9 lb",
      session: session
    )
    appendLog("LIVE_VERIFY patched itemId=\(createResult.itemId) status=listed retention=\(retentionUntil)")

    let remotePhotoId = try XCTUnwrap(createResult.photoIdByLocalPhotoId[firstPhoto.localPhotoId])
    let updatePacket = NativeUploadItemPacketV1(
      store: .init(shortCode: "DEF", name: "Default Store", remoteId: createResult.storeId),
      batch: .init(name: batchName, status: "active", remoteId: createResult.batchId),
      item: .init(
        remoteId: createResult.itemId,
        sequence: itemSequence,
        status: "new",
        sku: "live-\(itemSequence)",
        notes: "ios resubmit note",
        weight: "2 lb",
        dimensions: "10 x 8 x 6 in",
        listedAtISO8601: nil
      ),
      photos: [
        NativeUploadItemPacketV1.Photo(
          localPhotoId: firstPhoto.localPhotoId,
          remotePhotoId: remotePhotoId,
          orderIndex: firstPhoto.orderIndex,
          capturedAtISO8601: firstPhoto.capturedAtISO8601,
          listing: firstPhoto.listing,
          thumbnail: firstPhoto.thumbnail,
          original: firstPhoto.original
        )
      ]
    )

    let updateResult = try await service.uploadItemPacket(updatePacket)
    XCTAssertEqual(updateResult.itemId, createResult.itemId)
    appendLog("LIVE_VERIFY resubmit itemId=\(updateResult.itemId) remotePhotoId=\(remotePhotoId)")

    let remoteAfterResubmit = try await fetchRemoteItem(
      baseURL: baseURL,
      anonKey: anonKey,
      accessToken: accessToken,
      itemId: createResult.itemId,
      session: session
    )
    appendLog(
      """
      LIVE_VERIFY remote_after_resubmit \
      status=\(remoteAfterResubmit.status ?? "nil") \
      listed_at=\(remoteAfterResubmit.listed_at ?? "nil") \
      retention=\(remoteAfterResubmit.photo_retention_until ?? "nil") \
      notes=\(remoteAfterResubmit.notes ?? "nil") \
      weight=\(remoteAfterResubmit.weight ?? "nil")
      """
    )

    XCTAssertEqual(remoteAfterResubmit.status, "listed")
    XCTAssertEqual(remoteAfterResubmit.listed_at, listedAt)
    XCTAssertEqual(remoteAfterResubmit.photo_retention_until, retentionUntil)
    XCTAssertEqual(remoteAfterResubmit.notes, "ios resubmit note")
    XCTAssertEqual(remoteAfterResubmit.weight, "2 lb")

    let duplicatePacket = NativeUploadItemPacketV1(
      store: .init(shortCode: "DEF", name: "Default Store", remoteId: createResult.storeId),
      batch: .init(name: batchName, status: "active", remoteId: createResult.batchId),
      item: .init(
        remoteId: nil,
        sequence: itemSequence,
        status: "new",
        sku: "live-dup-\(itemSequence)",
        notes: "duplicate create should fail",
        weight: "3 lb",
        dimensions: "10 x 8 x 6 in",
        listedAtISO8601: nil
      ),
      photos: [makePhoto(orderIndex: 0, color: .systemRed)]
    )

    do {
      _ = try await service.uploadItemPacket(duplicatePacket)
      XCTFail("Expected duplicate create conflict.")
    } catch let error as AppServiceError {
      let message = error.errorDescription ?? String(describing: error)
      appendLog("LIVE_VERIFY duplicate_conflict error=\(message)")
      XCTAssertTrue(message.contains("already exists in batch"))
    }
  }

  private func appendLog(_ message: String) {
    print(message)
    let line = "\(message)\n"
    let data = Data(line.utf8)
    let defaultURL = FileManager.default.temporaryDirectory.appendingPathComponent("live-handoff.log")
    appendLogData(data, to: defaultURL)
    if let path = ProcessInfo.processInfo.environment["LIVE_VERIFY_LOG_PATH"], !path.isEmpty {
      appendLogData(data, to: URL(fileURLWithPath: path))
    }
  }

  private func appendLogData(_ data: Data, to url: URL) {
    let directory = url.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: url.path) {
      if let handle = try? FileHandle(forWritingTo: url) {
        defer { try? handle.close() }
        try? handle.seekToEnd()
        try? handle.write(contentsOf: data)
      }
    } else {
      try? data.write(to: url)
    }
  }

  private func fetchAccessToken(
    baseURL: URL,
    anonKey: String,
    email: String,
    password: String,
    session: URLSession
  ) async throws -> String {
    let endpoint = try XCTUnwrap(URL(string: "/auth/v1/token?grant_type=password", relativeTo: baseURL))
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "email": email,
      "password": password,
    ])

    let (data, response) = try await session.data(for: request)
    let http = try XCTUnwrap(response as? HTTPURLResponse)
    XCTAssertTrue((200...299).contains(http.statusCode), "Auth failed: \(String(data: data, encoding: .utf8) ?? "<unreadable>")")
    return try JSONDecoder().decode(AuthResponse.self, from: data).access_token
  }

  private func patchRemoteItemState(
    baseURL: URL,
    anonKey: String,
    accessToken: String,
    itemId: String,
    status: String,
    listedAt: String,
    retentionUntil: String,
    notes: String,
    weight: String,
    session: URLSession
  ) async throws {
    let endpoint = try XCTUnwrap(URL(string: "/rest/v1/items?id=eq.\(itemId)", relativeTo: baseURL))
    var request = URLRequest(url: endpoint)
    request.httpMethod = "PATCH"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("return=representation", forHTTPHeaderField: "Prefer")
    request.httpBody = try JSONSerialization.data(withJSONObject: [
      "status": status,
      "listed_at": listedAt,
      "photo_retention_until": retentionUntil,
      "notes": notes,
      "weight": weight,
    ])

    let (data, response) = try await session.data(for: request)
    let http = try XCTUnwrap(response as? HTTPURLResponse)
    XCTAssertTrue((200...299).contains(http.statusCode), "Patch failed: \(String(data: data, encoding: .utf8) ?? "<unreadable>")")
  }

  private func fetchRemoteItem(
    baseURL: URL,
    anonKey: String,
    accessToken: String,
    itemId: String,
    session: URLSession
  ) async throws -> RemoteItemRow {
    let query = "/rest/v1/items?id=eq.\(itemId)&select=id,status,listed_at,photo_retention_until,notes,weight&limit=1"
    let endpoint = try XCTUnwrap(URL(string: query, relativeTo: baseURL))
    var request = URLRequest(url: endpoint)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await session.data(for: request)
    let http = try XCTUnwrap(response as? HTTPURLResponse)
    XCTAssertTrue((200...299).contains(http.statusCode), "Fetch failed: \(String(data: data, encoding: .utf8) ?? "<unreadable>")")
    let rows = try JSONDecoder().decode([RemoteItemRow].self, from: data)
    return try XCTUnwrap(rows.first)
  }

  private func makePhoto(orderIndex: Int, color: UIColor) -> NativeUploadItemPacketV1.Photo {
    let listingBytes = jpegData(color: color, size: CGSize(width: 24, height: 24), compressionQuality: 0.85)
    let thumbnailBytes = jpegData(color: color.withAlphaComponent(0.8), size: CGSize(width: 12, height: 12), compressionQuality: 0.7)
    let capturedAt = ISO8601DateFormatter().string(from: Date())
    return NativeUploadItemPacketV1.Photo(
      localPhotoId: UUID().uuidString.lowercased(),
      remotePhotoId: nil,
      orderIndex: orderIndex,
      capturedAtISO8601: capturedAt,
      listing: .init(bytes: listingBytes, mimeType: "image/jpeg", width: 24, height: 24),
      thumbnail: .init(bytes: thumbnailBytes, mimeType: "image/jpeg", width: 12, height: 12),
      original: nil
    )
  }

  private func jpegData(color: UIColor, size: CGSize, compressionQuality: CGFloat) -> Data {
    let renderer = UIGraphicsImageRenderer(size: size)
    let image = renderer.image { context in
      color.setFill()
      context.fill(CGRect(origin: .zero, size: size))
    }
    return image.jpegData(compressionQuality: compressionQuality) ?? Data([0xFF, 0xD8, 0xFF, 0xD9])
  }
}
