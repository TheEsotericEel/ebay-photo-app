import Foundation

enum AppServiceError: LocalizedError {
  case notConfigured(String)
  case invalidRequest(String)
  case network(String)
  case server(String)

  var errorDescription: String? {
    switch self {
    case .notConfigured(let message):
      return message
    case .invalidRequest(let message):
      return message
    case .network(let message):
      return message
    case .server(let message):
      return message
    }
  }
}

final class SupabaseService {
  private struct Config {
    let baseURL: URL
    let anonKey: String
    let bucket: String
  }

  private struct Session: Codable {
    let accessToken: String
    let refreshToken: String?
    let userId: String?
    let expiresAt: TimeInterval?
  }

  private enum AuthGrantType: String, Codable {
    // This app uses numeric OTP code entry, so Supabase verify type should be email.
    case emailOTP = "email"
  }

  private struct AuthVerifyResponse: Decodable {
    let access_token: String
    let refresh_token: String?
    let expires_at: TimeInterval?
    let user: AuthUser?
  }

  private struct AuthSignUpResponse: Decodable {
    let access_token: String?
    let refresh_token: String?
    let expires_at: TimeInterval?
    let user: AuthUser?
  }

  private struct AuthUser: Decodable {
    let id: String?
  }

  private struct StoreRow: Decodable {
    let id: String
  }

  private struct BatchRow: Decodable {
    let id: String
  }

  private struct ItemRow: Decodable {
    let id: String
  }

  private struct PhotoRow: Decodable {
    let id: String
  }

  private struct BatchCountsUpdateBody: Encodable {
    let item_count: Int
    let photo_count: Int
    let upload_status: String
  }

  private let sessionStoreKey = "ebp.supabase.session.v1"
  private let defaultStorageBucket = "photo-assets"
  private let userDefaults: UserDefaults
  private let urlSession: URLSession
  private var cachedSession: Session?

  init(
    userDefaults: UserDefaults = .standard,
    urlSession: URLSession = .shared
  ) {
    self.userDefaults = userDefaults
    self.urlSession = urlSession
    cachedSession = Self.loadSession(from: userDefaults, key: sessionStoreKey)
    AppLog.auth.info("Session bootstrap complete hasSession=\(self.cachedSession != nil, privacy: .public)")
  }

  func sendOTP(email: String) async throws {
    let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }

    let config = try loadConfig()
    AppLog.auth.info("OTP request started email=\(self.maskedEmail(trimmed), privacy: .public)")
    let payload: [String: Any] = [
      "email": trimmed,
      "create_user": true,
    ]
    do {
      _ = try await performAuthJSONRequest(
        config: config,
        method: "POST",
        path: "/auth/v1/otp",
        body: payload
      )
      AppLog.auth.info("OTP request succeeded")
    } catch {
      AppLog.auth.error("OTP request failed error=\(error.localizedDescription, privacy: .public)")
      throw error
    }
  }

  func verifyOTP(email: String, code: String) async throws {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }
    guard !trimmedCode.isEmpty else {
      throw AppServiceError.notConfigured("Enter the OTP code from email.")
    }

    let config = try loadConfig()
    AppLog.auth.info("OTP verify started email=\(self.maskedEmail(trimmedEmail), privacy: .public)")
    let payload: [String: Any] = [
      "email": trimmedEmail,
      "token": trimmedCode,
      "type": AuthGrantType.emailOTP.rawValue,
    ]

    do {
      let data = try await performAuthJSONRequest(
        config: config,
        method: "POST",
        path: "/auth/v1/verify",
        body: payload
      )

      let response = try decode(AuthVerifyResponse.self, from: data)
      let session = Session(
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        userId: response.user?.id,
        expiresAt: response.expires_at
      )
      saveSession(session)
      AppLog.auth.info("OTP verify succeeded userIdPresent=\(response.user?.id != nil, privacy: .public)")
    } catch {
      AppLog.auth.error("OTP verify failed error=\(error.localizedDescription, privacy: .public)")
      throw error
    }
  }

  func signInWithPassword(email: String, password: String) async throws {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }
    guard !trimmedPassword.isEmpty else {
      throw AppServiceError.notConfigured("Enter your password first.")
    }

    let config = try loadConfig()
    AppLog.auth.info("Password sign-in started email=\(self.maskedEmail(trimmedEmail), privacy: .public)")
    let payload: [String: Any] = [
      "email": trimmedEmail,
      "password": trimmedPassword,
    ]
    do {
      let data = try await performAuthJSONRequest(
        config: config,
        method: "POST",
        path: "/auth/v1/token?grant_type=password",
        body: payload
      )
      let response = try decode(AuthVerifyResponse.self, from: data)
      let session = Session(
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        userId: response.user?.id,
        expiresAt: response.expires_at
      )
      saveSession(session)
      AppLog.auth.info("Password sign-in succeeded userIdPresent=\(response.user?.id != nil, privacy: .public)")
    } catch {
      AppLog.auth.error("Password sign-in failed error=\(error.localizedDescription, privacy: .public)")
      throw error
    }
  }

  func signUpWithEmailPassword(email: String, password: String) async throws -> Bool {
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedEmail.isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }
    guard !trimmedPassword.isEmpty else {
      throw AppServiceError.notConfigured("Enter a password first.")
    }

    let config = try loadConfig()
    AppLog.auth.info("Password account creation started email=\(self.maskedEmail(trimmedEmail), privacy: .public)")
    let payload: [String: Any] = [
      "email": trimmedEmail,
      "password": trimmedPassword,
    ]
    do {
      let data = try await performAuthJSONRequest(
        config: config,
        method: "POST",
        path: "/auth/v1/signup",
        body: payload
      )
      let response = try decode(AuthSignUpResponse.self, from: data)
      if let accessToken = response.access_token {
        let session = Session(
          accessToken: accessToken,
          refreshToken: response.refresh_token,
          userId: response.user?.id,
          expiresAt: response.expires_at
        )
        saveSession(session)
        AppLog.auth.info("Password account creation succeeded with active session")
        return true
      }
      AppLog.auth.notice("Password account created; email confirmation may be required")
      return false
    } catch {
      AppLog.auth.error("Password account creation failed error=\(error.localizedDescription, privacy: .public)")
      throw error
    }
  }

  func signOut() {
    cachedSession = nil
    userDefaults.removeObject(forKey: sessionStoreKey)
    AppLog.auth.info("Session cleared via sign out")
  }

  func uploadCurrentBatch() async throws {
    throw AppServiceError.notConfigured("Native upload requires a packet. Use uploadItemPacket(_:) for V1.")
  }

  @discardableResult
  func uploadItemPacket(_ packet: NativeUploadItemPacketV1) async throws -> NativeUploadItemPacketV1Result {
    guard !packet.photos.isEmpty else {
      throw AppServiceError.invalidRequest("Item packet must include at least one photo.")
    }

    AppLog.upload.info("Upload packet start store=\(packet.store.shortCode, privacy: .public) batch=\(packet.batch.name, privacy: .public) item=\(packet.item.sequence, privacy: .public) photos=\(packet.photos.count, privacy: .public)")

    let config = try loadConfig()
    let session = try requireSession()
    var batchIdForFailure: String?
    var preUploadedPhotoIdForFailure: String?
    var successfulPhotoUploadCount = 0
    var currentStage = "initialize"

    do {
      currentStage = "resolve_store"
      AppLog.upload.info("Store resolve/create start shortCode=\(packet.store.shortCode, privacy: .public)")
      let storeId = try await resolveOrCreateStore(config: config, session: session, store: packet.store)
      AppLog.upload.info("Store resolve/create success storeId=\(storeId, privacy: .public)")
      currentStage = "resolve_batch"
      AppLog.upload.info("Batch resolve/create start batch=\(packet.batch.name, privacy: .public)")
      let batchId = try await resolveOrCreateBatch(config: config, session: session, storeId: storeId, batch: packet.batch)
      AppLog.upload.info("Batch resolve/create success batchId=\(batchId, privacy: .public)")
      batchIdForFailure = batchId
      currentStage = "upsert_item"
      let itemId = try await upsertItem(
        config: config,
        session: session,
        storeId: storeId,
        batchId: batchId,
        item: packet.item
      )
      AppLog.upload.info("Item upsert success itemId=\(itemId, privacy: .public)")

      var photoIdByLocalPhotoId: [String: String] = [:]
      var listingStorageKeys: [String] = []
      var thumbnailStorageKeys: [String] = []

      for photo in packet.photos.sorted(by: { $0.orderIndex < $1.orderIndex }) {
        let remotePhotoId = UUID().uuidString.lowercased()
        photoIdByLocalPhotoId[photo.localPhotoId] = remotePhotoId

        currentStage = "upsert_photo_row_\(photo.orderIndex)"
        AppLog.upload.debug("Photo row upsert start order=\(photo.orderIndex, privacy: .public) photoId=\(remotePhotoId, privacy: .public)")
        try await upsertPhotoPreUpload(
          config: config,
          session: session,
          photoId: remotePhotoId,
          storeId: storeId,
          batchId: batchId,
          itemId: itemId,
          orderIndex: photo.orderIndex,
          capturedAtISO8601: photo.capturedAtISO8601
        )
        preUploadedPhotoIdForFailure = remotePhotoId
        AppLog.upload.debug("Photo row upsert success order=\(photo.orderIndex, privacy: .public) photoId=\(remotePhotoId, privacy: .public)")

        let listingKey = storagePath(
          storeId: storeId,
          batchId: batchId,
          itemId: itemId,
          photoId: remotePhotoId,
          variant: "listing"
        )
        let thumbnailKey = storagePath(
          storeId: storeId,
          batchId: batchId,
          itemId: itemId,
          photoId: remotePhotoId,
          variant: "thumbnail"
        )

        currentStage = "upload_listing_\(photo.orderIndex)"
        AppLog.upload.debug("Storage upload start variant=listing order=\(photo.orderIndex, privacy: .public) bytes=\(photo.listing.bytes.count, privacy: .public)")
        try await uploadVariantToStorage(
          config: config,
          session: session,
          key: listingKey,
          bytes: photo.listing.bytes,
          mimeType: photo.listing.mimeType
        )
        AppLog.upload.debug("Storage upload success variant=listing key=\(listingKey, privacy: .public)")

        currentStage = "upload_thumbnail_\(photo.orderIndex)"
        AppLog.upload.debug("Storage upload start variant=thumbnail order=\(photo.orderIndex, privacy: .public) bytes=\(photo.thumbnail.bytes.count, privacy: .public)")
        try await uploadVariantToStorage(
          config: config,
          session: session,
          key: thumbnailKey,
          bytes: photo.thumbnail.bytes,
          mimeType: photo.thumbnail.mimeType
        )
        AppLog.upload.debug("Storage upload success variant=thumbnail key=\(thumbnailKey, privacy: .public)")

        currentStage = "upsert_variant_listing_\(photo.orderIndex)"
        try await upsertPhotoVariant(
          config: config,
          session: session,
          photoId: remotePhotoId,
          variantType: "listing",
          storageKey: listingKey,
          payload: photo.listing
        )
        AppLog.upload.debug("Variant upsert success variant=listing photoId=\(remotePhotoId, privacy: .public)")

        currentStage = "upsert_variant_thumbnail_\(photo.orderIndex)"
        try await upsertPhotoVariant(
          config: config,
          session: session,
          photoId: remotePhotoId,
          variantType: "thumbnail",
          storageKey: thumbnailKey,
          payload: photo.thumbnail
        )
        AppLog.upload.debug("Variant upsert success variant=thumbnail photoId=\(remotePhotoId, privacy: .public)")

        currentStage = "finalize_photo_\(photo.orderIndex)"
        try await finalizePhotoUpload(
          config: config,
          session: session,
          photoId: remotePhotoId
        )
        AppLog.upload.debug("Photo finalize success order=\(photo.orderIndex, privacy: .public) photoId=\(remotePhotoId, privacy: .public)")

        successfulPhotoUploadCount += 1
        preUploadedPhotoIdForFailure = nil
        listingStorageKeys.append(listingKey)
        thumbnailStorageKeys.append(thumbnailKey)
      }

      if let firstPhotoId = packet.photos
        .sorted(by: { $0.orderIndex < $1.orderIndex })
        .first
        .flatMap({ photoIdByLocalPhotoId[$0.localPhotoId] }) {
        try await updateItemMainPhoto(
          config: config,
          session: session,
          itemId: itemId,
          mainPhotoId: firstPhotoId
        )
        AppLog.upload.info("Main photo updated mainPhotoId=\(firstPhotoId, privacy: .public)")
      }

      currentStage = "finalize_batch"
      try await updateBatchCountsAndStatus(
        config: config,
        session: session,
        batchId: batchId,
        uploadStatus: "uploaded"
      )
      AppLog.upload.info("Batch finalize success status=uploaded")

      currentStage = "complete"
      return NativeUploadItemPacketV1Result(
        storeId: storeId,
        batchId: batchId,
        itemId: itemId,
        photoIdByLocalPhotoId: photoIdByLocalPhotoId,
        listingStorageKeys: listingStorageKeys,
        thumbnailStorageKeys: thumbnailStorageKeys
      )
    } catch {
      AppLog.upload.error("Upload failed stage=\(currentStage, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
      if let preUploadedPhotoIdForFailure {
        AppLog.upload.info("Failure patch start photoId=\(preUploadedPhotoIdForFailure, privacy: .public)")
        do {
          try await markPhotoFailed(
            config: config,
            session: session,
            photoId: preUploadedPhotoIdForFailure,
            errorMessage: error.localizedDescription
          )
          AppLog.upload.info("Failure patch success photoId=\(preUploadedPhotoIdForFailure, privacy: .public)")
        } catch {
          AppLog.upload.error("Failure patch failed photoId=\(preUploadedPhotoIdForFailure, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
      }

      if let batchIdForFailure {
        let batchStatus = successfulPhotoUploadCount > 0 ? "partial" : "failed"
        AppLog.upload.info("Batch failure finalize start status=\(batchStatus, privacy: .public) batchId=\(batchIdForFailure, privacy: .public)")
        do {
          try await updateBatchCountsAndStatus(
            config: config,
            session: session,
            batchId: batchIdForFailure,
            uploadStatus: batchStatus
          )
          AppLog.upload.info("Batch failure finalize success status=\(batchStatus, privacy: .public) batchId=\(batchIdForFailure, privacy: .public)")
        } catch {
          AppLog.upload.error("Batch failure finalize failed batchId=\(batchIdForFailure, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
      }
      throw error
    }
  }

  // MARK: - Internal REST operations

  private func resolveOrCreateStore(
    config: Config,
    session: Session,
    store: NativeUploadItemPacketV1.Store
  ) async throws -> String {
    let escapedShortCode = urlEncoded(store.shortCode)
    let queryPath = "/rest/v1/stores?short_code=eq.\(escapedShortCode)&select=id&limit=1"
    let existingData = try await performAuthedRequest(
      config: config,
      session: session,
      method: "GET",
      pathWithQuery: queryPath,
      body: nil,
      additionalHeaders: [:]
    )
    let existingRows = try decode([StoreRow].self, from: existingData)
    if let id = existingRows.first?.id {
      return id
    }

    let body: [[String: String]] = [[
      "name": store.name,
      "short_code": store.shortCode,
    ]]
    let createData = try await performAuthedRequest(
      config: config,
      session: session,
      method: "POST",
      pathWithQuery: "/rest/v1/stores",
      body: body,
      additionalHeaders: [
        "Prefer": "return=representation",
      ]
    )
    let createdRows = try decode([StoreRow].self, from: createData)
    guard let createdId = createdRows.first?.id else {
      throw AppServiceError.server("Store creation returned no id.")
    }
    return createdId
  }

  private func resolveOrCreateBatch(
    config: Config,
    session: Session,
    storeId: String,
    batch: NativeUploadItemPacketV1.Batch
  ) async throws -> String {
    let queryPath = "/rest/v1/batches?store_id=eq.\(urlEncoded(storeId))&name=eq.\(urlEncoded(batch.name))&select=id&limit=1"
    let existingData = try await performAuthedRequest(
      config: config,
      session: session,
      method: "GET",
      pathWithQuery: queryPath,
      body: nil,
      additionalHeaders: [:]
    )
    let existingRows = try decode([BatchRow].self, from: existingData)
    if let id = existingRows.first?.id {
      return id
    }

    let body: [[String: Any]] = [[
      "store_id": storeId,
      "name": batch.name,
      "status": batch.status,
      "upload_status": "local",
      "remote_retention_mode": "delete_7d_after_listed",
    ]]

    let createData = try await performAuthedRequest(
      config: config,
      session: session,
      method: "POST",
      pathWithQuery: "/rest/v1/batches",
      body: body,
      additionalHeaders: [
        "Prefer": "return=representation",
      ]
    )
    let createdRows = try decode([BatchRow].self, from: createData)
    guard let createdId = createdRows.first?.id else {
      throw AppServiceError.server("Batch creation returned no id.")
    }
    return createdId
  }

  private func upsertItem(
    config: Config,
    session: Session,
    storeId: String,
    batchId: String,
    item: NativeUploadItemPacketV1.Item
  ) async throws -> String {
    let payload: [String: Any] = [
      "store_id": storeId,
      "batch_id": batchId,
      "sequence": item.sequence,
      "status": item.status,
      "sku": jsonOrNull(item.sku),
      "notes": jsonOrNull(item.notes),
      "weight": jsonOrNull(item.weight),
      "dimensions": jsonOrNull(item.dimensions),
      "listed_at": jsonOrNull(item.listedAtISO8601),
      "photo_retention_until": NSNull(),
    ]

    let data = try await performAuthedRequest(
      config: config,
      session: session,
      method: "POST",
      pathWithQuery: "/rest/v1/items?on_conflict=batch_id,sequence",
      body: [payload],
      additionalHeaders: [
        "Prefer": "resolution=merge-duplicates,return=representation",
      ]
    )
    let rows = try decode([ItemRow].self, from: data)
    guard let itemId = rows.first?.id else {
      throw AppServiceError.server("Item upsert returned no id.")
    }
    return itemId
  }

  private func upsertPhotoPreUpload(
    config: Config,
    session: Session,
    photoId: String,
    storeId: String,
    batchId: String,
    itemId: String,
    orderIndex: Int,
    capturedAtISO8601: String
  ) async throws {
    let payload: [[String: Any]] = [[
      "id": photoId,
      "store_id": storeId,
      "batch_id": batchId,
      "item_id": itemId,
      "order_index": orderIndex,
      "local_status": "present",
      "upload_status": "uploading",
      "remote_status": "not_uploaded",
      "captured_at": capturedAtISO8601,
      "upload_attempt_count": 1,
      "remote_delete_eligible_at": NSNull(),
      "remote_expires_at": NSNull(),
    ]]

    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "POST",
      pathWithQuery: "/rest/v1/photos?on_conflict=id",
      body: payload,
      additionalHeaders: [
        "Prefer": "resolution=merge-duplicates,return=minimal",
      ]
    )
  }

  private func upsertPhotoVariant(
    config: Config,
    session: Session,
    photoId: String,
    variantType: String,
    storageKey: String,
    payload: NativeUploadItemPacketV1.VariantPayload
  ) async throws {
    let now = ISO8601DateFormatter().string(from: Date())
    let body: [[String: Any]] = [[
      "photo_id": photoId,
      "variant_type": variantType,
      "storage_bucket": config.bucket,
      "storage_key": storageKey,
      "width": jsonOrNull(payload.width),
      "height": jsonOrNull(payload.height),
      "bytes": payload.bytes.count,
      "mime_type": payload.mimeType,
      "uploaded_at": now,
    ]]

    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "POST",
      pathWithQuery: "/rest/v1/photo_variants?on_conflict=photo_id,variant_type",
      body: body,
      additionalHeaders: [
        "Prefer": "resolution=merge-duplicates,return=minimal",
      ]
    )
  }

  private func finalizePhotoUpload(
    config: Config,
    session: Session,
    photoId: String
  ) async throws {
    let body: [[String: Any]] = [[
      "upload_status": "uploaded",
      "remote_status": "uploaded",
      "local_status": "safe_to_clear",
    ]]
    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "PATCH",
      pathWithQuery: "/rest/v1/photos?id=eq.\(urlEncoded(photoId))",
      body: body.first,
      additionalHeaders: [
        "Prefer": "return=minimal",
      ]
    )
  }

  private func markPhotoFailed(
    config: Config,
    session: Session,
    photoId: String,
    errorMessage: String
  ) async throws {
    let safeMessage = String(errorMessage.prefix(500))
    let body: [String: Any] = [
      "upload_status": "failed",
      "remote_status": "failed",
      "last_upload_error": safeMessage,
    ]
    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "PATCH",
      pathWithQuery: "/rest/v1/photos?id=eq.\(urlEncoded(photoId))",
      body: body,
      additionalHeaders: [
        "Prefer": "return=minimal",
      ]
    )
  }

  private func updateItemMainPhoto(
    config: Config,
    session: Session,
    itemId: String,
    mainPhotoId: String
  ) async throws {
    let body: [String: Any] = [
      "main_photo_id": mainPhotoId,
    ]
    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "PATCH",
      pathWithQuery: "/rest/v1/items?id=eq.\(urlEncoded(itemId))",
      body: body,
      additionalHeaders: [
        "Prefer": "return=minimal",
      ]
    )
  }

  private func updateBatchCountsAndStatus(
    config: Config,
    session: Session,
    batchId: String,
    uploadStatus: String
  ) async throws {
    let itemCount = try await countRows(config: config, session: session, table: "items", batchId: batchId)
    let photoCount = try await countRows(config: config, session: session, table: "photos", batchId: batchId)
    let body = BatchCountsUpdateBody(
      item_count: itemCount,
      photo_count: photoCount,
      upload_status: uploadStatus
    )

    _ = try await performAuthedRequest(
      config: config,
      session: session,
      method: "PATCH",
      pathWithQuery: "/rest/v1/batches?id=eq.\(urlEncoded(batchId))",
      body: body,
      additionalHeaders: [
        "Prefer": "return=minimal",
      ]
    )
  }

  private func countRows(
    config: Config,
    session: Session,
    table: String,
    batchId: String
  ) async throws -> Int {
    let path = "/rest/v1/\(table)?batch_id=eq.\(urlEncoded(batchId))&select=id"
    let data = try await performAuthedRequest(
      config: config,
      session: session,
      method: "GET",
      pathWithQuery: path,
      body: nil,
      additionalHeaders: [:]
    )
    let rows = try decode([PhotoRow].self, from: data)
    return rows.count
  }

  private func uploadVariantToStorage(
    config: Config,
    session: Session,
    key: String,
    bytes: Data,
    mimeType: String
  ) async throws {
    let escapedKey = key
      .split(separator: "/")
      .map { urlEncoded(String($0)) }
      .joined(separator: "/")

    guard let endpoint = URL(string: "/storage/v1/object/\(config.bucket)/\(escapedKey)", relativeTo: config.baseURL) else {
      throw AppServiceError.notConfigured("Invalid Supabase storage URL.")
    }
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.httpBody = bytes
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
    request.setValue("true", forHTTPHeaderField: "x-upsert")
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await urlSession.data(for: request)
    } catch {
      throw AppServiceError.network("Storage upload failed: \(error.localizedDescription)")
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw AppServiceError.server("Storage upload failed: invalid response.")
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      let message = parseServerMessage(data: data)
      throw AppServiceError.server("Storage upload failed (\(httpResponse.statusCode)): \(message)")
    }
  }

  // MARK: - HTTP helpers

  private func performAuthJSONRequest(
    config: Config,
    method: String,
    path: String,
    body: [String: Any]
  ) async throws -> Data {
    guard let endpoint = URL(string: path, relativeTo: config.baseURL) else {
      throw AppServiceError.notConfigured("Invalid Supabase auth URL.")
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    return try await execute(request, requestName: "Supabase auth request", authErrorFormatting: true)
  }

  private func performAuthedRequest(
    config: Config,
    session: Session,
    method: String,
    pathWithQuery: String,
    body: Any?,
    additionalHeaders: [String: String]
  ) async throws -> Data {
    guard let endpoint = URL(string: pathWithQuery, relativeTo: config.baseURL) else {
      throw AppServiceError.notConfigured("Invalid Supabase endpoint.")
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
    additionalHeaders.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }

    if let body {
      if let encodable = body as? BatchCountsUpdateBody {
        request.httpBody = try JSONEncoder().encode(encodable)
      } else {
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
      }
    }

    return try await execute(request, requestName: "Supabase request")
  }

  private func execute(
    _ request: URLRequest,
    requestName: String,
    authErrorFormatting: Bool = false
  ) async throws -> Data {
    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await urlSession.data(for: request)
    } catch {
      throw AppServiceError.network("\(requestName) failed: \(error.localizedDescription)")
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw AppServiceError.server("\(requestName) failed: invalid response.")
    }

    guard (200 ... 299).contains(httpResponse.statusCode) else {
      let message = authErrorFormatting
        ? formatAuthHTTPError(statusCode: httpResponse.statusCode, data: data)
        : parseServerMessage(data: data)
      throw AppServiceError.server("\(requestName) failed (\(httpResponse.statusCode)): \(message)")
    }
    return data
  }

  private func formatAuthHTTPError(statusCode: Int, data: Data) -> String {
    let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    let errorCode = (json["error_code"] as? String) ?? (json["code"] as? String) ?? ""
    let serverMessage = parseServerMessage(data: data)

    if statusCode == 429, errorCode == "over_email_send_rate_limit" {
      return """
      Supabase email send rate limit exceeded. Built-in SMTP allows only a few auth emails per hour project-wide.

      To unblock now:
      1) Use "Sign In with Password" only (does not send email).
      2) Create the user in Supabase Dashboard → Authentication → Users → Add user (enable Auto Confirm), then sign in with password.
      3) Wait for the hourly limit to reset, or configure custom SMTP in Project Settings → Auth.
      4) Avoid "Send OTP Code" and "Create Password Account" until the limit clears.

      For simulator upload testing without auth, set DEVELOPMENT_AUTH_BYPASS = YES in Secrets.xcconfig (DEBUG only).
      """
    }

    if statusCode == 429 {
      return """
      Supabase auth rate limit exceeded (\(serverMessage)).

      Wait a few minutes and retry. Password sign-in does not send email; OTP and signup flows do.
      """
    }

    if statusCode == 400, errorCode == "invalid_credentials" {
      return """
      Invalid email or password. If you have not created this account yet, add the user in Supabase Dashboard (Auto Confirm) or wait until email rate limits reset before using "Create Password Account".
      """
    }

    return serverMessage
  }

  private func parseServerMessage(data: Data) -> String {
    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      if let message = json["msg"] as? String, !message.isEmpty { return message }
      if let message = json["message"] as? String, !message.isEmpty { return message }
      if let error = json["error"] as? String, !error.isEmpty { return error }
      if let hint = json["hint"] as? String, !hint.isEmpty { return hint }
    }
    if let text = String(data: data, encoding: .utf8), !text.isEmpty {
      return text
    }
    return "Unknown server error"
  }

  private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
    do {
      return try JSONDecoder().decode(type, from: data)
    } catch {
      throw AppServiceError.server("Failed to decode server response: \(error.localizedDescription)")
    }
  }

  private func requireSession() throws -> Session {
    if let cachedSession {
      return cachedSession
    }
    AppLog.auth.error("No Supabase session available for authenticated request")
    throw AppServiceError.notConfigured("No Supabase session. Sign in first.")
  }

  private func loadConfig() throws -> Config {
    AppLog.config.debug("Config load started")
    guard let info = Bundle.main.infoDictionary else {
      AppLog.config.error("Config load failed: missing info dictionary")
      throw AppServiceError.notConfigured("Missing app runtime configuration. Check Info.plist/build settings.")
    }

    let rawURL = (info["SUPABASE_URL"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let normalizedURL = rawURL
      .replacingOccurrences(of: "\\/", with: "/")
      .trimmingCharacters(in: CharacterSet(charactersIn: "\""))

    guard !normalizedURL.isEmpty else {
      AppLog.config.error("Config load failed: SUPABASE_URL missing")
      throw AppServiceError.notConfigured("Missing SUPABASE_URL in Info.plist/build settings.")
    }
    guard
      let baseURL = URL(string: normalizedURL),
      let scheme = baseURL.scheme?.lowercased(),
      (scheme == "https" || scheme == "http"),
      baseURL.host?.isEmpty == false
    else {
      AppLog.config.error("Config load failed: SUPABASE_URL invalid")
      throw AppServiceError.notConfigured("Invalid SUPABASE_URL value. Expected a full http(s) URL.")
    }

    let anonKey = (info["SUPABASE_ANON_KEY"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !anonKey.isEmpty else {
      AppLog.config.error("Config load failed: SUPABASE_ANON_KEY missing")
      throw AppServiceError.notConfigured("Missing SUPABASE_ANON_KEY in Info.plist/build settings.")
    }

    let bucket = (info["SUPABASE_STORAGE_BUCKET"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    // Intentional V1 default from BACKEND_CONTRACT_V1.
    let resolvedBucket = (bucket?.isEmpty == false) ? bucket! : defaultStorageBucket
    AppLog.config.info("Config load succeeded urlPresent=true anonKeyPresent=true bucket=\(resolvedBucket, privacy: .public)")
    return Config(
      baseURL: baseURL,
      anonKey: anonKey,
      bucket: resolvedBucket
    )
  }

  private func saveSession(_ session: Session) {
    cachedSession = session
    // DEV-ONLY: Storing auth tokens in UserDefaults is acceptable for MVP testing.
    // Move session persistence to Keychain before production use.
    if let encoded = try? JSONEncoder().encode(session) {
      userDefaults.set(encoded, forKey: sessionStoreKey)
    }
  }

  private static func loadSession(from defaults: UserDefaults, key: String) -> Session? {
    guard
      let data = defaults.data(forKey: key),
      let session = try? JSONDecoder().decode(Session.self, from: data)
    else {
      return nil
    }
    return session
  }

  private func maskedEmail(_ email: String) -> String {
    let parts = email.split(separator: "@", maxSplits: 1).map(String.init)
    guard parts.count == 2 else { return "***" }
    let local = parts[0]
    let domain = parts[1]
    guard let first = local.first else { return "***@\(domain)" }
    return "\(first)***@\(domain)"
  }

  private func storagePath(storeId: String, batchId: String, itemId: String, photoId: String, variant: String) -> String {
    "\(storeId)/batches/\(batchId)/items/\(itemId)/photos/\(photoId)/\(variant)"
  }

  private func jsonOrNull<T>(_ value: T?) -> Any {
    value ?? NSNull()
  }

  private func urlEncoded(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
  }
}
