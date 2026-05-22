import SwiftUI
import UIKit

struct RootView: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var supabase: SupabaseService
  @StateObject private var cameraService = CameraService()
  @StateObject private var cameraPreferences = CameraPreferencesStore()
  @State private var showingCamera = false
  @State private var showingDetails = false
  @State private var showingQueueReview = false
  @State private var showingTextInputLab = false
  @State private var didRestoreSession = false

  private var shouldBypassAuth: Bool { AppState.usesDevelopmentAuthBypass }

  var body: some View {
    Group {
      if shouldBypassAuth || appState.isAuthenticated {
        if showingCamera {
          CameraSessionView(
            cameraService: cameraService,
            cameraPreferences: cameraPreferences,
            showingDetails: $showingDetails,
            onBack: { showingCamera = false },
            onDone: { showingCamera = false }
          )
        } else {
          CaptureHomeView(
            onOpenCamera: { showingCamera = true },
            onUploadBatch: {
              appState.statusMessage = "Submitting queued items…"
              appState.uploadMessage = ""
              Task {
                if !appState.capturedPhotos.isEmpty {
                  appState.advanceToNextItem()
                }
                let eligible = appState.queueEligibleForSubmit()
                guard !eligible.isEmpty else {
                  appState.statusMessage = "No queued items are ready to submit."
                  return
                }

                var submittedCount = 0
                var failedCount = 0

                for item in eligible {
                  appState.markQueuedItemUploadAttemptStarted(itemId: item.id)
                  appState.updateQueuedItemSubmitState(item.id, state: .submitting)
                  appState.setQueueSubmitProgress(
                    itemId: item.id,
                    itemNumber: item.itemNumber,
                    stage: "submitting_item",
                    message: "Submitting item \(item.itemNumber)"
                  )
                  do {
                    let packet = try appState.makeUploadPacket(from: item)
                    let result = try await supabase.uploadItemPacket(packet) { progress in
                      Task { @MainActor in
                        appState.setQueueSubmitProgress(
                          itemId: item.id,
                          itemNumber: item.itemNumber,
                          stage: progress.stage,
                          message: progress.message,
                          photoIndex: progress.photoIndex,
                          photoCount: progress.photoCount
                        )
                      }
                    }
                    appState.captureStoreRemoteId = result.storeId
                    appState.captureBatchRemoteId = result.batchId
                    appState.applyUploadResult(for: item.id, result: result)
                    appState.updateQueuedItemSubmitState(item.id, state: .submitted, errorMessage: nil)
                    submittedCount += 1
                  } catch {
                    appState.markQueuedItemUploadFailure(itemId: item.id, errorMessage: error.localizedDescription)
                    appState.updateQueuedItemSubmitState(
                      item.id,
                      state: .failed,
                      errorMessage: error.localizedDescription
                    )
                    failedCount += 1
                  }
                }

                appState.statusMessage = "Submit finished."
                appState.uploadMessage = "Submitted \(submittedCount) item(s); failed \(failedCount)."
                appState.clearQueueSubmitProgress()
              }
            },
            onUploadFixture: {
              appState.statusMessage = "Uploading debug fixture…"
              appState.uploadMessage = ""
              let fixtureInput = DebugFixtureBuilder.Input(
                captureStoreName: appState.captureStoreName,
                captureStoreShortCode: appState.captureStoreShortCode,
                captureBatchName: appState.captureBatchName,
                currentItemNumber: appState.currentItemNumber
              )
              Task {
                do {
                  let packet = try await Task.detached(priority: .userInitiated) {
                    try DebugFixtureBuilder.makePacket(fixtureInput)
                  }.value
                  let result = try await supabase.uploadItemPacket(packet)
                  appState.captureStoreRemoteId = result.storeId
                  appState.captureBatchRemoteId = result.batchId
                  appState.uploadMessage = "Fixture uploaded (\(result.photoIdByLocalPhotoId.count) photo(s))."
                  appState.statusMessage = "Debug fixture upload completed."
                } catch {
                  appState.uploadMessage = error.localizedDescription
                  appState.statusMessage = "Debug fixture upload failed."
                }
              }
            },
            onReviewQueue: { showingQueueReview = true },
            onClearSafeLocalCopies: {
              let cleared = appState.clearSafeLocalPhotoCopies()
              if cleared == 0 {
                appState.statusMessage = "No safe local copies available to clear."
              } else {
                appState.statusMessage = "Cleared \(cleared) safe local photo copy(ies)."
              }
            },
            onSignOut: {
              if shouldBypassAuth {
                appState.statusMessage = "Development auth bypass stays enabled."
              } else {
                supabase.signOut()
                appState.isAuthenticated = false
                appState.authCode = ""
                appState.authError = ""
                appState.uploadMessage = ""
                appState.statusMessage = "Signed out."
              }
            },
            onOpenInputLab: { showingTextInputLab = true }
          )
        }
      } else {
        AuthView(
          email: Binding(
            get: { appState.authEmail },
            set: { appState.authEmail = $0 }
          ),
          code: Binding(
            get: { appState.authCode },
            set: { appState.authCode = $0 }
          ),
          password: Binding(
            get: { appState.authPassword },
            set: { appState.authPassword = $0 }
          ),
          statusMessage: appState.statusMessage,
          errorMessage: appState.authError,
          onSendCode: {
            Task {
              do {
                try await supabase.sendOTP(email: appState.authEmail)
                appState.authError = ""
                appState.statusMessage = "OTP code requested."
              } catch {
                appState.authError = error.localizedDescription
              }
            }
          },
          onSignIn: {
            Task {
              do {
                try await supabase.verifyOTP(email: appState.authEmail, code: appState.authCode)
                appState.isAuthenticated = true
                appState.authError = ""
                appState.statusMessage = "Signed in."
              } catch {
                appState.authError = error.localizedDescription
              }
            }
          },
          onSignInWithPassword: {
            Task {
              do {
                try await supabase.signInWithPassword(
                  email: appState.authEmail,
                  password: appState.authPassword
                )
                appState.isAuthenticated = true
                appState.authError = ""
                appState.statusMessage = "Signed in with password."
              } catch {
                appState.authError = error.localizedDescription
              }
            }
          },
          onCreatePasswordAccount: {
            Task {
              do {
                let signedIn = try await supabase.signUpWithEmailPassword(
                  email: appState.authEmail,
                  password: appState.authPassword
                )
                if signedIn {
                  appState.isAuthenticated = true
                  appState.authError = ""
                  appState.statusMessage = "Account created and signed in."
                } else {
                  appState.authError = ""
                  appState.statusMessage = "Account created. Check email to confirm, then sign in."
                }
              } catch {
                appState.authError = error.localizedDescription
              }
            }
          },
          onOpenInputLab: { showingTextInputLab = true }
        )
      }
    }
    .onAppear {
      guard !didRestoreSession else { return }
      didRestoreSession = true
      guard !shouldBypassAuth, supabase.hasPersistedSession else { return }
      guard !appState.isAuthenticated else { return }
      appState.isAuthenticated = true
      appState.statusMessage = "Session restored."
      Task {
        do {
          try await supabase.refreshSessionIfNeeded()
        } catch {
          supabase.signOut()
          appState.isAuthenticated = false
          appState.statusMessage = "Session expired. Sign in again."
          appState.uploadMessage = error.localizedDescription
        }
      }
    }
    .task(id: appState.isAuthenticated) {
      guard appState.isAuthenticated, !shouldBypassAuth else { return }
      await pollWorkspaceSnapshotLoop()
    }
    #if DEBUG
    .onAppear {
      if ProcessInfo.processInfo.arguments.contains("-open-input-lab") {
        showingTextInputLab = true
      }
    }
    #endif
    .fullScreenCover(isPresented: $showingTextInputLab) {
      TextInputLabView()
    }
    .fullScreenCover(isPresented: $showingQueueReview) {
      QueueReviewSheet(onOpenCamera: {
        showingQueueReview = false
        showingCamera = true
      })
      .environmentObject(appState)
    }
  }

  private func pollWorkspaceSnapshotLoop() async {
    while !Task.isCancelled && appState.isAuthenticated {
      do {
        let snapshot = try await supabase.fetchWorkspaceSnapshot()
        await MainActor.run {
          appState.mergeRemoteWorkspaceSnapshot(snapshot)
        }
      } catch {
        AppLog.auth.error("Workspace sync failed error=\(error.localizedDescription, privacy: .public)")
      }

      do {
        try await Task.sleep(nanoseconds: 30 * 1_000_000_000)
      } catch {
        return
      }
    }
  }

}

private struct CameraContextStrip: View {
  let storeName: String
  let storeShortCode: String
  let batchName: String
  let itemNumber: Int
  let onStoreBatchTap: () -> Void
  let onItemTap: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      contextChip(
        title: "Store",
        value: storeShortCode,
        subtitle: storeName,
        icon: "storefront",
        action: onStoreBatchTap
      )

      contextChip(
        title: "Batch",
        value: batchName,
        subtitle: "Current set",
        icon: "folder",
        action: onStoreBatchTap
      )

      contextChip(
        title: "Item",
        value: "\(itemNumber)",
        subtitle: "Active packet",
        icon: "tag",
        action: onItemTap
      )
    }
  }

  private func contextChip(
    title: String,
    value: String,
    subtitle: String,
    icon: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(alignment: .center, spacing: 10) {
        Image(systemName: icon)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white.opacity(0.9))
          .frame(width: 22)

        VStack(alignment: .leading, spacing: 1) {
          Text(title)
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
          Text(value)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
          Text(subtitle)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
      .background {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .fill(.white.opacity(0.08))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
          .stroke(.white.opacity(0.12), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
  }
}

private struct CameraMetadataTray: View {
  let sku: String
  let weight: String
  let dimensions: String
  let notes: String
  let onEditDetails: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Label("Item Details", systemImage: "doc.text")
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer()
        Button("Edit", action: onEditDetails)
          .font(.caption.weight(.semibold))
          .buttonStyle(.bordered)
          .tint(.white)
      }

      VStack(spacing: 10) {
        HStack(spacing: 10) {
          metadataCell(title: "SKU", value: sku)
          metadataCell(title: "Weight", value: weight)
        }

        HStack(spacing: 10) {
          metadataCell(title: "Dimensions", value: dimensions)
          metadataCell(title: "Notes", value: notes, isWide: true)
        }
      }
    }
    .padding(14)
    .background {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(.white.opacity(0.08))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(.white.opacity(0.12), lineWidth: 1)
    }
  }

  private func metadataCell(title: String, value: String, isWide: Bool = false) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value.isEmpty ? "Tap Edit to add" : value)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(value.isEmpty ? Color.secondary : Color.white)
        .lineLimit(isWide ? 2 : 1)
        .minimumScaleFactor(0.85)
    }
    .frame(maxWidth: .infinity, minHeight: isWide ? 56 : 48, alignment: .leading)
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(.black.opacity(0.28))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(.white.opacity(0.08), lineWidth: 1)
    }
  }
}

#if DEBUG
private enum DebugFixtureBuilder {
  struct Input: Sendable {
    let captureStoreName: String
    let captureStoreShortCode: String
    let captureBatchName: String
    let currentItemNumber: Int
  }

  static func makePacket(_ input: Input) throws -> NativeUploadItemPacketV1 {
    let formatter = ISO8601DateFormatter()
    let now = Date()

    let photos: [NativeUploadItemPacketV1.Photo] = try (0 ..< 2).map { index in
      let image = makeFixtureImage(order: index)
      guard let listingData = image.jpegData(compressionQuality: 0.82) else {
        throw AppServiceError.invalidRequest("Failed to generate fixture listing image \(index + 1).")
      }
      guard let thumbnailData = image.ebp_thumbnailData() else {
        throw AppServiceError.invalidRequest("Failed to generate fixture thumbnail \(index + 1).")
      }
      guard let thumbnailImage = UIImage(data: thumbnailData) else {
        throw AppServiceError.invalidRequest("Failed to decode fixture thumbnail \(index + 1).")
      }

      return NativeUploadItemPacketV1.Photo(
        localPhotoId: UUID().uuidString,
        remotePhotoId: nil,
        orderIndex: index,
        capturedAtISO8601: formatter.string(from: now.addingTimeInterval(TimeInterval(index))),
        listing: .init(
          bytes: listingData,
          mimeType: "image/jpeg",
          width: pixelWidth(from: image),
          height: pixelHeight(from: image)
        ),
        thumbnail: .init(
          bytes: thumbnailData,
          mimeType: "image/jpeg",
          width: pixelWidth(from: thumbnailImage),
          height: pixelHeight(from: thumbnailImage)
        )
      )
    }

    return NativeUploadItemPacketV1(
      store: .init(shortCode: input.captureStoreShortCode, name: input.captureStoreName, remoteId: nil),
      batch: .init(name: input.captureBatchName, status: "active", remoteId: nil),
      item: .init(
        remoteId: nil,
        sequence: input.currentItemNumber,
        status: "new",
        sku: "fixture-\(input.currentItemNumber)",
        notes: "Debug fixture upload generated in app.",
        weight: nil,
        dimensions: nil,
        listedAtISO8601: nil
      ),
      photos: photos
    )
  }

  private static func makeFixtureImage(order: Int) -> UIImage {
    // Smaller than camera deliverables — debug upload only; keeps UI responsive off main actor.
    let size = CGSize(width: 640, height: 640)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      let background: UIColor = order == 0 ? .systemTeal : .systemOrange
      background.setFill()
      context.fill(CGRect(origin: .zero, size: size))

      UIColor.white.withAlphaComponent(0.25).setFill()
      context.fill(CGRect(x: 0, y: size.height * 0.55, width: size.width, height: size.height * 0.45))

      let title = "DEBUG FIXTURE \(order + 1)"
      let subtitle = "eBay Photo App"
      let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.boldSystemFont(ofSize: 36),
        .foregroundColor: UIColor.white,
      ]
      let subtitleAttrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 18, weight: .medium),
        .foregroundColor: UIColor.white.withAlphaComponent(0.95),
      ]

      let titleSize = title.size(withAttributes: titleAttrs)
      let subtitleSize = subtitle.size(withAttributes: subtitleAttrs)
      let centerX = (size.width - titleSize.width) / 2
      title.draw(at: CGPoint(x: centerX, y: 260), withAttributes: titleAttrs)
      subtitle.draw(at: CGPoint(x: (size.width - subtitleSize.width) / 2, y: 310), withAttributes: subtitleAttrs)
    }
  }

  private static func pixelWidth(from image: UIImage) -> Int? {
    if let cgImage = image.cgImage { return cgImage.width }
    let value = Int((image.size.width * image.scale).rounded())
    return value > 0 ? value : nil
  }

  private static func pixelHeight(from image: UIImage) -> Int? {
    if let cgImage = image.cgImage { return cgImage.height }
    let value = Int((image.size.height * image.scale).rounded())
    return value > 0 ? value : nil
  }
}
#endif

private struct AuthView: View {
  @Binding var email: String
  @Binding var code: String
  @Binding var password: String
  let statusMessage: String
  let errorMessage: String
  let onSendCode: () -> Void
  let onSignIn: () -> Void
  let onSignInWithPassword: () -> Void
  let onCreatePasswordAccount: () -> Void
  let onOpenInputLab: (() -> Void)?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Email OTP (recommended)")
              .font(.headline)
            Text(
              "Use OTP as the default sign-in flow. If email rate limits block OTP, use password as a temporary fallback."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)

            LabeledTextField(
              title: "Email",
              text: $email,
              autocapitalize: .never,
              autocorrectDisabled: true,
              keyboardType: .emailAddress
            )
            Button("Send OTP Code", action: onSendCode)
              .buttonStyle(.bordered)
            LabeledTextField(title: "Code", text: $code, keyboardType: .numberPad)
            Button("Sign In with OTP Code", action: onSignIn)
              .buttonStyle(.borderedProminent)
          }

          VStack(alignment: .leading, spacing: 8) {
            Text("Password fallback")
              .font(.headline)
            Text("Use only when OTP is temporarily unavailable.")
              .font(.footnote)
              .foregroundStyle(.secondary)
            LabeledTextField(title: "Password", text: $password, isSecure: true)
            Button("Sign In with Password", action: onSignInWithPassword)
              .buttonStyle(.bordered)
          }

          VStack(alignment: .leading, spacing: 8) {
            Text("Create account (sends email)")
              .font(.headline)
            Button("Create Password Account", action: onCreatePasswordAccount)
              .buttonStyle(.bordered)
          }

          VStack(alignment: .leading, spacing: 8) {
            Text("Status")
              .font(.headline)
            Text(statusMessage)
            if !errorMessage.isEmpty {
              Text(errorMessage)
                .foregroundStyle(.red)
            }
          }

          #if DEBUG
          if let onOpenInputLab {
            Button("Open Text Input Lab", action: onOpenInputLab)
              .buttonStyle(.bordered)
          }
          #endif
        }
        .padding()
      }
      .navigationTitle("Ebay Photo App")
    }
  }
}

private struct CaptureHomeView: View {
  let onOpenCamera: () -> Void
  let onUploadBatch: () -> Void
  let onUploadFixture: () -> Void
  let onReviewQueue: () -> Void
  let onClearSafeLocalCopies: () -> Void
  let onSignOut: () -> Void
  let onOpenInputLab: (() -> Void)?
  @EnvironmentObject private var appState: AppState

  var body: some View {
    NavigationStack {
      List {
        Section("Active Batch") {
          LabeledContent("Store", value: appState.captureStoreName)
          LabeledContent("Short code", value: appState.captureStoreShortCode)
          LabeledContent("Batch", value: appState.captureBatchName)
          LabeledContent("Item", value: "\(appState.currentItemNumber)")
          LabeledContent("Draft photos", value: "\(appState.capturedPhotos.count)")
          LabeledContent("Queued items", value: "\(appState.queuedItemPackets.count)")
        }

        Section("Local Queue") {
          if appState.queuedItemPackets.isEmpty {
            Text("No queued items yet. Capture photos and tap Next to add item packets.")
              .foregroundStyle(.secondary)
          } else {
            ForEach(appState.queuedItemPackets.sorted(by: { $0.itemNumber < $1.itemNumber })) { item in
              VStack(alignment: .leading, spacing: 4) {
                Text("Item \(item.itemNumber) · \(item.photos.count) photo(s)")
                  .font(.subheadline.weight(.semibold))
                Text("\(item.storeShortCode) · \(item.batchName)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
                Text(queueStateText(item.submitState))
                  .font(.footnote)
                  .foregroundStyle(item.submitState == .failed ? .red : .secondary)
                if let progress = appState.queueSubmitProgress, progress.itemId == item.id {
                  Text(progress.message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                if let error = item.lastSubmitError, !error.isEmpty {
                  Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .lineLimit(2)
                }
              }
            }
          }
        }

        Section("Actions") {
          Button("Open Camera", action: onOpenCamera)
          Button("Review Queue", action: onReviewQueue)
          Button("Upload Batch", action: onUploadBatch)
          Button("Clear Safe Local Copies", action: onClearSafeLocalCopies)
            .disabled(appState.safeLocalCleanupCandidates().isEmpty)
          #if DEBUG
          Button("Upload Debug Fixture", action: onUploadFixture)
          if let onOpenInputLab {
            Button("Open Text Input Lab", action: onOpenInputLab)
          }
          #endif
          Button("Sign Out", role: .destructive, action: onSignOut)
        }

        Section("Status") {
          Text(appState.statusMessage)
          if !appState.uploadMessage.isEmpty {
            Text(appState.uploadMessage)
          }
          if let progress = appState.queueSubmitProgress {
            Text(progress.message)
            if let photoIndex = progress.photoIndex, let photoCount = progress.photoCount {
              Text("Photo \(photoIndex) of \(photoCount)")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
          }
        }
      }
      .navigationTitle("Capture Home")
    }
  }

  private func queueStateText(_ state: AppState.QueueItemSubmitState) -> String {
    switch state {
    case .local:
      return "Local (not submitted)"
    case .submitting:
      return "Submitting…"
    case .submitted:
      return "Submitted"
    case .failed:
      return "Failed"
    }
  }
}

private struct QueueReviewSheet: View {
  @EnvironmentObject private var appState: AppState
  @Environment(\.dismiss) private var dismiss
  let onOpenCamera: () -> Void

  var body: some View {
    NavigationStack {
      List {
        if appState.queuedItemPackets.isEmpty {
          Text("Queue is empty. Capture photos and tap Next to create queued item packets.")
            .foregroundStyle(.secondary)
        } else {
          ForEach(appState.queuedItemPackets.sorted(by: { $0.itemNumber < $1.itemNumber })) { item in
            NavigationLink {
              QueueItemEditorView(itemId: item.id, onOpenCamera: onOpenCamera)
                .environmentObject(appState)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text("Item \(item.itemNumber)")
                  .font(.headline)
                Text("\(item.storeShortCode) · \(item.batchName)")
                  .font(.caption)
                  .foregroundStyle(.secondary)
                Text("\(item.photos.count) photo(s) · \(submitStateLabel(item.submitState))")
                  .font(.footnote)
                  .foregroundStyle(.secondary)
                if let progress = appState.queueSubmitProgress, progress.itemId == item.id {
                  Text(progress.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
              }
            }
          }
        }
      }
      .navigationTitle("Queue Review")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
        }
      }
    }
  }

  private func submitStateLabel(_ state: AppState.QueueItemSubmitState) -> String {
    switch state {
    case .local:
      return "Local"
    case .submitting:
      return "Submitting"
    case .submitted:
      return "Submitted"
    case .failed:
      return "Failed"
    }
  }
}

private struct QueueItemEditorView: View {
  @EnvironmentObject private var appState: AppState
  @Environment(\.dismiss) private var dismiss
  let itemId: UUID
  let onOpenCamera: () -> Void

  @State private var sku = ""
  @State private var weight = ""
  @State private var dimensions = ""
  @State private var notes = ""
  @State private var storeName = ""
  @State private var storeShortCode = ""
  @State private var batchName = ""

  var body: some View {
    Group {
      if let item = appState.queuedItemPacket(id: itemId) {
        let isSubmitting = item.submitState == .submitting
        let isSubmitted = item.submitState == .submitted
        let canEdit = !isSubmitting
        Form {
          Section("Metadata") {
            TextField("SKU", text: $sku).disabled(!canEdit)
            TextField("Weight", text: $weight).disabled(!canEdit)
            TextField("Dimensions", text: $dimensions).disabled(!canEdit)
            TextField("Notes", text: $notes, axis: .vertical)
              .lineLimit(2 ... 4)
              .disabled(!canEdit)
            Button("Save Item Details") {
              appState.updateQueuedItemContext(
                itemId: item.id,
                storeName: storeName,
                storeShortCode: storeShortCode,
                batchName: batchName
              )
              appState.updateQueuedItemMetadata(
                itemId: item.id,
                sku: sku,
                weight: weight,
                dimensions: dimensions,
                notes: notes
              )
            }
            .disabled(!canEdit)
          }

          Section("Store Assignment") {
            TextField("Store name", text: $storeName).disabled(!canEdit)
            TextField("Store short code", text: $storeShortCode).disabled(!canEdit)
            TextField("Batch name", text: $batchName).disabled(!canEdit)
            Text("Store assignment is per queued item packet.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          Section("Photos") {
            if item.photos.isEmpty {
              Text("No photos in this queued item.")
                .foregroundStyle(.secondary)
            } else {
              ForEach(item.photos) { photo in
                HStack(spacing: 12) {
                  if let data = appState.queuedPhotoPreviewData(itemId: item.id, photoId: photo.id),
                     let image = UIImage(data: data) {
                    Image(uiImage: image)
                      .resizable()
                      .scaledToFill()
                      .frame(width: 52, height: 52)
                      .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                  } else {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                      .fill(Color.gray.opacity(0.2))
                      .frame(width: 52, height: 52)
                  }

                  VStack(alignment: .leading, spacing: 2) {
                    Text(photo.lensLabel)
                      .font(.subheadline.weight(.medium))
                    Text(photo.capturedAt.formatted(date: .abbreviated, time: .shortened))
                      .font(.caption)
                      .foregroundStyle(.secondary)
                    Text("State: \(photo.uploadState.rawValue) · attempts: \(photo.uploadAttemptCount)")
                      .font(.caption2)
                      .foregroundStyle(.secondary)
                    if let err = photo.lastUploadError, !err.isEmpty {
                      Text(err)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(2)
                    }
                  }

                  Spacer()

                  Button("Remove", role: .destructive) {
                    appState.removeQueuedPhoto(itemId: item.id, photoId: photo.id)
                  }
                  .buttonStyle(.borderless)
                  .disabled(!canEdit || isSubmitted)
                }
              }
            }
          }

          Section("Actions") {
            if isSubmitted {
              Button("Mark For Re-submit") {
                appState.markQueuedItemForResubmit(itemId: item.id)
              }
              .foregroundStyle(.orange)
            }

            Button("Resume Item In Camera") {
              let promoted = appState.promoteQueuedItemToDraft(itemId: item.id)
              if promoted {
                dismiss()
                onOpenCamera()
              } else {
                appState.statusMessage = "Unable to load queued item into draft."
              }
            }
            .foregroundStyle(.blue)
            .disabled(isSubmitting)

            Button("Delete Queued Item", role: .destructive) {
              appState.removeQueuedItem(itemId: item.id)
              dismiss()
            }
            .disabled(isSubmitting)
          }
        }
        .navigationTitle("Item \(item.itemNumber)")
        .onAppear {
          sku = item.sku
          weight = item.weight
          dimensions = item.dimensions
          notes = item.notes
          storeName = item.storeName
          storeShortCode = item.storeShortCode
          batchName = item.batchName
        }
      } else {
        ContentUnavailableView("Item Not Found", systemImage: "exclamationmark.triangle")
      }
    }
  }
}

private struct CameraSessionView: View {
  @ObservedObject var cameraService: CameraService
  @ObservedObject var cameraPreferences: CameraPreferencesStore
  @EnvironmentObject private var appState: AppState
  @Binding var showingDetails: Bool
  let onBack: () -> Void
  let onDone: () -> Void

  @State private var showingContext = false
  @State private var pinchStartZoom: Double?
  @State private var isCaptureLoopRunning = false
  @State private var pendingCaptureCount = 0
  private let maxPendingCaptures = 2

  private var isEditingOverlayPresented: Bool {
    showingContext || showingDetails
  }

  var body: some View {
    VStack(spacing: 12) {
      CameraTopBar(
        title: "Current Batch · Item \(appState.currentItemNumber)",
        photoCount: appState.capturedPhotos.count,
        onBack: onBack
      )

      CameraContextStrip(
        storeName: appState.captureStoreName,
        storeShortCode: appState.captureStoreShortCode,
        batchName: appState.captureBatchName,
        itemNumber: appState.currentItemNumber,
        onStoreBatchTap: { presentContextEditor() },
        onItemTap: { presentDetailsEditor() }
      )
      .padding(.horizontal, 16)

      Group {
        if isEditingOverlayPresented {
          cameraPreviewPlaceholder
        } else {
          CameraPreviewArea(
            session: cameraService.session,
            cameraService: cameraService,
            cameraPreferences: cameraPreferences,
            pinchStartZoom: $pinchStartZoom,
            canUndo: !appState.capturedPhotos.isEmpty,
            onUndo: {
              appState.undoLastCapture()
            },
            onSelectLens: { lens in
              cameraPreferences.preferredLens = lens
              cameraPreferences.switchingMode = .locked
              reconfigureCamera()
            },
            onSelectAuto: {
              cameraPreferences.switchingMode = .auto
              reconfigureCamera()
            }
          )
        }
      }
      .frame(maxHeight: .infinity)
      .padding(.horizontal, 16)

      CameraMetadataTray(
        sku: appState.currentItemSku,
        weight: appState.currentItemWeight,
        dimensions: appState.currentItemDimensions,
        notes: appState.currentItemNotes,
        onEditDetails: { presentDetailsEditor() }
      )
      .padding(.horizontal, 16)

      ZoomControlRow(
        currentZoom: cameraService.currentZoom,
        minZoom: cameraService.minZoom,
        maxZoom: cameraService.userFacingMaxZoom,
        onZoomChange: updateZoom,
        formatZoom: formatZoom
      )

      GuideToggleRow(
        gridEnabled: $cameraPreferences.gridEnabled,
        horizonGuideEnabled: $cameraPreferences.horizonGuideEnabled,
        showsTapToFocusHint: cameraService.supportsFocusPoint || cameraService.supportsExposurePoint
      )

      CameraActionBar(
        thumbnailImage: appState.capturedPhotos.last?.thumbnailImage,
        photoCount: appState.capturedPhotos.count,
        canCapture: cameraService.canCapture || (isCaptureLoopRunning && pendingCaptureCount < maxPendingCaptures),
        onCapture: {
          if !isCaptureLoopRunning {
            startCaptureLoop()
          } else if pendingCaptureCount < maxPendingCaptures {
            pendingCaptureCount += 1
          }
        },
        onNextItem: {
          appState.advanceToNextItem()
        },
        onDone: onDone
      )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Color.black.ignoresSafeArea())
    .padding(.bottom, 10)
    .onAppear {
      startCamera()
    }
    .onDisappear {
      cameraService.stop()
    }
    .fullScreenCover(isPresented: $showingContext) {
      CaptureContextSheet()
        .environmentObject(appState)
    }
    .fullScreenCover(isPresented: $showingDetails) {
      ItemDetailsSheet()
        .environmentObject(appState)
    }
  }

  private var cameraPreviewPlaceholder: some View {
    GeometryReader { geo in
      let side = max(min(geo.size.width, geo.size.height), 120)
      Color.black
        .frame(width: side, height: side)
        .frame(maxWidth: .infinity)
    }
  }

  private func presentContextEditor() {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      showingContext = true
    }
  }

  private func presentDetailsEditor() {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      showingDetails = true
    }
  }

  private func startCaptureLoop() {
    guard !isCaptureLoopRunning else { return }
    isCaptureLoopRunning = true
    
    Task {
      while true {
        do {
          let photo = try await cameraService.capturePhoto(aspectMode: cameraPreferences.aspectMode)
          appState.addCapturedPhoto(photo)
        } catch {
          appState.statusMessage = "Capture failed: \(error.localizedDescription)"
        }
        
        if pendingCaptureCount > 0 {
          pendingCaptureCount -= 1
        } else {
          isCaptureLoopRunning = false
          break
        }
      }
    }
  }

  private func startCamera() {
    let lens = cameraPreferences.preferredLens
    let zoom = cameraPreferences.zoom(for: lens)
    cameraService.start(
      lensState: cameraPreferences.normalizedLensState(),
      zoom: zoom
    )
  }

  private func reconfigureCamera() {
    let lens = cameraPreferences.preferredLens
    let zoom = cameraPreferences.zoom(for: lens)
    cameraService.applyLensState(
      cameraPreferences.normalizedLensState(),
      zoom: zoom
    )
  }

  private func updateZoom(_ zoom: Double) {
    let lens = cameraPreferences.preferredLens
    let cap = cameraService.userFacingMaxZoom
    let clamped = min(max(zoom, cameraService.minZoom), max(cap, cameraService.minZoom))
    cameraPreferences.setZoom(clamped, for: lens)
    cameraService.setZoom(clamped)
  }

  private func formatZoom(_ zoom: Double) -> String {
    if zoom < 1 {
      // Strip leading zero: 0.5 → ".5x" matching native Camera style.
      let s = String(format: "%.1f", zoom)  // "0.5"
      return String(s.dropFirst()) + "x"    // ".5x"
    }
    let whole = zoom.rounded(.towardZero)
    if abs(zoom - whole) < 0.05 {
      return String(format: "%.0fx", zoom)  // "2x"
    }
    return String(format: "%.1fx", zoom)    // "1.2x"
  }
}
