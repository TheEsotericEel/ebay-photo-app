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
  @State private var showingMockIntakeFlow = false
  @State private var showingTextInputLab = false
  @State private var didRestoreSession = false
  @State private var didSeedLiveCameraDraft = false

  private var shouldBypassAuth: Bool { AppState.usesDevelopmentAuthBypass }
  private var shouldOpenMockIntakeFlowOnLaunch: Bool {
    #if DEBUG
    ProcessInfo.processInfo.arguments.contains("-open-mock-intake-flow")
    #else
    false
    #endif
  }
  private var shouldOpenCaptureHomeOnLaunch: Bool {
    #if DEBUG
    ProcessInfo.processInfo.arguments.contains("-open-capture-home")
    #else
    false
    #endif
  }
  private var shouldOpenLiveCameraWithSeededPhotoOnLaunch: Bool {
    #if DEBUG
    ProcessInfo.processInfo.arguments.contains("-open-live-camera-with-seeded-photo")
    #else
    false
    #endif
  }

  var body: some View {
    Group {
      if shouldOpenMockIntakeFlowOnLaunch {
        MockIntakeFlowView()
      } else {
        Group {
          if shouldBypassAuth || appState.isAuthenticated {
            if showingCamera {
              CameraSessionView(
                cameraService: cameraService,
                cameraPreferences: cameraPreferences,
                showingDetails: $showingDetails,
                onBack: { showingCamera = false },
                onDone: { showingCamera = false },
                onOpenQueueReview: {
                  showingCamera = false
                  showingQueueReview = true
                }
              )
          } else {
            CaptureHomeView(
              onOpenCamera: { showingCamera = true },
              onUploadBatch: {
                Task {
                  if !appState.capturedPhotos.isEmpty {
                    appState.statusMessage = "Finish the current item before submitting."
                    return
                  }

                  _ = await submitQueuedItems(advanceCurrentDraftIfNeeded: false)
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
              onPreviewIntakeFlow: { showingMockIntakeFlow = true },
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
            password: Binding(
              get: { appState.authPassword },
              set: { appState.authPassword = $0 }
            ),
            statusMessage: appState.statusMessage,
            errorMessage: appState.authError,
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
      }
    }
    .onAppear {
      guard !didRestoreSession else { return }
      didRestoreSession = true
      #if DEBUG
      if shouldOpenCaptureHomeOnLaunch {
        if !appState.isAuthenticated {
          appState.isAuthenticated = true
        }
        appState.statusMessage = "Debug capture home route opened."
        return
      }
      if shouldOpenLiveCameraWithSeededPhotoOnLaunch {
        if !appState.isAuthenticated {
          appState.isAuthenticated = true
        }
        seedLiveCameraDraftIfNeeded()
        showingCamera = true
        appState.statusMessage = "Debug live camera route opened."
        return
      }
      #endif
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
      QueueReviewSheet(
        onOpenCamera: {
          showingQueueReview = false
          showingCamera = true
        },
        onSubmit: {
          await submitQueuedItems(advanceCurrentDraftIfNeeded: false)
        }
      )
      .environmentObject(appState)
    }
    .fullScreenCover(isPresented: $showingMockIntakeFlow) {
      MockIntakeFlowView()
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

  #if DEBUG
  private func seedLiveCameraDraftIfNeeded() {
    guard !didSeedLiveCameraDraft else { return }
    didSeedLiveCameraDraft = true

    appState.clearCurrentItem()
    if let photo = makeDebugSeededCapturedPhoto() {
      appState.addCapturedPhoto(photo)
      appState.statusMessage = "Seeded live camera draft ready."
    } else {
      appState.statusMessage = "Unable to seed live camera draft."
    }
  }

  @MainActor
  private func submitQueuedItems(advanceCurrentDraftIfNeeded: Bool) async -> Bool {
    guard appState.queueSubmitProgress == nil else {
      appState.statusMessage = "Submit already in progress."
      return false
    }

    appState.statusMessage = "Submitting queued items…"
    appState.uploadMessage = ""

    if advanceCurrentDraftIfNeeded, !appState.capturedPhotos.isEmpty {
      appState.advanceToNextItem()
    }

    let eligible = appState.queueEligibleForSubmit()
    guard !eligible.isEmpty else {
      appState.statusMessage = "No queued items are ready to submit."
      return false
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
    return submittedCount > 0 && failedCount == 0
  }

  private func makeDebugSeededCapturedPhoto() -> CapturedPhoto? {
    let size = CGSize(width: 1024, height: 1024)
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { context in
      let rect = CGRect(origin: .zero, size: size)
      UIColor(red: 0.11, green: 0.09, blue: 0.08, alpha: 1).setFill()
      context.fill(rect)

      UIColor(red: 0.46, green: 0.28, blue: 0.16, alpha: 1).setFill()
      context.fill(CGRect(x: 120, y: 180, width: 520, height: 360))

      UIColor(red: 0.20, green: 0.28, blue: 0.36, alpha: 1).setFill()
      context.fill(CGRect(x: 520, y: 300, width: 280, height: 220))

      UIColor.white.withAlphaComponent(0.12).setFill()
      context.fill(CGRect(x: 0, y: 0, width: size.width, height: 88))
    }

    guard let data = image.jpegData(compressionQuality: 0.9) else {
      return nil
    }

    return CapturedPhoto(
      data: data,
      thumbnailData: data,
      lensLabel: "1x",
      capturedAt: Date()
    )
  }
  #endif

}

private struct CameraContextStrip: View {
  let storeName: String
  let storeShortCode: String
  let batchName: String
  let itemNumber: Int
  let onStoreBatchTap: () -> Void
  let onItemTap: () -> Void

  var body: some View {
    HStack(spacing: 6) {
      contextSegment(
        icon: "storefront",
        value: storeShortCode,
        accessibilityLabel: "Store \(storeShortCode), \(storeName). Edit store or batch.",
        action: onStoreBatchTap
      )

      contextDivider

      contextSegment(
        icon: "folder",
        value: batchName,
        accessibilityLabel: "Batch \(batchName). Edit store or batch.",
        action: onStoreBatchTap
      )

      contextDivider

      contextSegment(
        icon: "tag",
        value: "Item \(itemNumber)",
        accessibilityLabel: "Item \(itemNumber). Edit item details.",
        action: onItemTap
      )
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.white.opacity(0.08))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(.white.opacity(0.1), lineWidth: 1)
    }
  }

  private var contextDivider: some View {
    Text("·")
      .font(.caption.weight(.semibold))
      .foregroundStyle(.secondary.opacity(0.7))
  }

  private func contextSegment(
    icon: String,
    value: String,
    accessibilityLabel: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: icon)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.white.opacity(0.85))
        Text(value)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(accessibilityLabel)
  }
}

private struct CameraMetadataTray: View {
  @Binding var sku: String
  @Binding var weight: String
  @Binding var dimensions: String
  @Binding var notes: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        InlineMetadataField(
          title: "SKU",
          text: $sku,
          autocapitalize: .characters,
          autocorrectDisabled: true
        )

        InlineMetadataField(
          title: "Wt",
          text: $weight,
          autocorrectDisabled: true
        )
      }

      HStack(spacing: 8) {
        InlineMetadataField(
          title: "Dim",
          text: $dimensions,
          autocorrectDisabled: true
        )

        InlineMetadataField(
          title: "Note",
          text: $notes
        )
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .background {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.white.opacity(0.06))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(.white.opacity(0.1), lineWidth: 1)
    }
  }
}

private struct InlineMetadataField: View {
  let title: String
  @Binding var text: String
  var autocapitalize: TextInputAutocapitalization?
  var autocorrectDisabled = false
  var keyboardType: UIKeyboardType = .default

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)

      TextField(title, text: $text)
        .font(.caption.weight(.medium))
        .textFieldStyle(.plain)
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(.white.opacity(0.07))
        }
        .overlay {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(.white.opacity(0.08), lineWidth: 1)
        }
        .keyboardType(keyboardType)
        .modifier(OptionalAutocapitalize(autocapitalize: autocapitalize))
        .autocorrectionDisabled(autocorrectDisabled)
        .tint(.white)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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
        ),
        original: nil
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
  @Binding var password: String
  let statusMessage: String
  let errorMessage: String
  let onSignInWithPassword: () -> Void
  let onCreatePasswordAccount: () -> Void
  let onOpenInputLab: (() -> Void)?

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Ebay Photo App")
              .font(.largeTitle.weight(.semibold))
            Text("Sign in with your app account. Google sign-in is planned once the auth surface is ready.")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          VStack(alignment: .leading, spacing: 12) {
            LabeledTextField(
              title: "Email",
              text: $email,
              autocapitalize: .never,
              autocorrectDisabled: true,
              keyboardType: .emailAddress
            )
            LabeledTextField(title: "Password", text: $password, isSecure: true)

            VStack(alignment: .leading, spacing: 10) {
              Button("Sign In", action: onSignInWithPassword)
                .buttonStyle(.borderedProminent)
              Button("Create Account", action: onCreatePasswordAccount)
                .buttonStyle(.bordered)
            }
          }

          VStack(alignment: .leading, spacing: 6) {
            Text("Status")
              .font(.headline)
            Text(statusMessage)
              .foregroundStyle(.secondary)
            if !errorMessage.isEmpty {
              Text(errorMessage)
                .foregroundStyle(.red)
            }
          }

          #if DEBUG
          if let onOpenInputLab {
            Divider()
            VStack(alignment: .leading, spacing: 8) {
              Text("Debug")
                .font(.headline)
              Text("Text Input Lab stays available for launch-route testing only.")
                .font(.footnote)
                .foregroundStyle(.secondary)
              Button("Open Text Input Lab", action: onOpenInputLab)
                .buttonStyle(.bordered)
            }
          }
          #endif
        }
        .frame(maxWidth: 420, alignment: .leading)
        .padding(.vertical, 12)
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
  let onPreviewIntakeFlow: () -> Void
  let onClearSafeLocalCopies: () -> Void
  let onSignOut: () -> Void
  let onOpenInputLab: (() -> Void)?
  @EnvironmentObject private var appState: AppState

  private var sortedQueuedItems: [AppState.LocalQueueItemPacket] {
    appState.queuedItemPackets.sorted(by: { $0.itemNumber < $1.itemNumber })
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          homeHeader

          CaptureHomeCard(title: "Capture Workflow") {
            VStack(alignment: .leading, spacing: 12) {
              Button(action: onOpenCamera) {
                HStack(spacing: 10) {
                  Image(systemName: "camera.fill")
                    .font(.headline.weight(.semibold))
                  Text("Open Camera")
                    .font(.headline.weight(.semibold))
                  Spacer(minLength: 0)
                  Image(systemName: "arrow.right")
                    .font(.subheadline.weight(.semibold))
                }
                .padding(.vertical, 14)
                .padding(.horizontal, 14)
                .frame(maxWidth: .infinity)
              }
              .buttonStyle(.plain)
              .foregroundStyle(.black)
              .accessibilityIdentifier("captureHome.openCamera")
              .background {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                  .fill(
                    LinearGradient(
                      colors: [Color.white, Color.white.opacity(0.88)],
                      startPoint: .topLeading,
                      endPoint: .bottomTrailing
                    )
                  )
              }

              HStack(spacing: 10) {
                HomeActionButton(
                  title: "Review Queue",
                  systemImage: "tray.full",
                  accessibilityIdentifier: "captureHome.reviewQueue",
                  action: onReviewQueue
                )
                HomeActionButton(
                  title: "Upload Batch",
                  systemImage: "arrow.up.circle",
                  accessibilityIdentifier: "captureHome.uploadBatch",
                  action: onUploadBatch
                )
              }

              HomeActionButton(
                title: "Preview Intake Flow",
                systemImage: "square.on.square",
                accessibilityIdentifier: "captureHome.previewIntakeFlow",
                action: onPreviewIntakeFlow
              )
            }
          }

          CaptureHomeCard(title: "Active Batch") {
            VStack(alignment: .leading, spacing: 12) {
              Text(appState.captureBatchName)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)

              Text("\(appState.captureStoreShortCode) · \(appState.captureStoreName)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)

              HStack(spacing: 8) {
                HomeMetricPill(label: "Item", value: "\(appState.currentItemNumber)")
                HomeMetricPill(label: "Draft", value: "\(appState.capturedPhotos.count)")
                HomeMetricPill(label: "Queued", value: "\(appState.queuedItemPackets.count)")
              }
            }
          }

          CaptureHomeCard(
            title: "Queue Preview",
            subtitle: appState.queuedItemPackets.isEmpty ? "No items queued yet." : "\(appState.queuedItemPackets.count) queued item(s)"
          ) {
            if sortedQueuedItems.isEmpty {
              EmptyHomeState(
                title: "Nothing queued yet",
                message: "Capture photos and tap Next to create the first item packet."
              )
            } else {
              VStack(spacing: 10) {
                ForEach(sortedQueuedItems.prefix(4)) { item in
                  QueuePreviewRow(
                    item: item,
                    progressMessage: appState.queueSubmitProgress?.itemId == item.id ? appState.queueSubmitProgress?.message : nil
                  )
                }

                if sortedQueuedItems.count > 4 {
                  Text("+\(sortedQueuedItems.count - 4) more item(s)")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
              }
            }

            if let item = sortedQueuedItems.first, let error = item.lastSubmitError, !error.isEmpty {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
                .lineLimit(2)
                .padding(.top, 2)
            }
          }

          CaptureHomeCard(title: "Status") {
            VStack(alignment: .leading, spacing: 10) {
              Text(appState.statusMessage)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)

              if !appState.uploadMessage.isEmpty {
                Text(appState.uploadMessage)
                  .font(.footnote)
                  .foregroundStyle(.secondary)
                  .fixedSize(horizontal: false, vertical: true)
              }

              if let progress = appState.queueSubmitProgress {
                VStack(alignment: .leading, spacing: 4) {
                  Text(progress.message)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.secondary)
                  if let photoIndex = progress.photoIndex, let photoCount = progress.photoCount {
                    Text("Photo \(photoIndex) of \(photoCount)")
                      .font(.caption)
                      .foregroundStyle(.secondary.opacity(0.8))
                  }
                }
              }
            }
          }

          CaptureHomeCard(title: "Utilities") {
            VStack(alignment: .leading, spacing: 10) {
              Button(action: onClearSafeLocalCopies) {
                homeUtilityLabel(
                  title: "Clear Safe Local Copies",
                  subtitle: "Removes local photo duplicates that are safe to discard.",
                  systemImage: "trash"
                )
              }
              .buttonStyle(.plain)
              .disabled(appState.safeLocalCleanupCandidates().isEmpty)
              .opacity(appState.safeLocalCleanupCandidates().isEmpty ? 0.5 : 1)

              #if DEBUG
              Button(action: onUploadFixture) {
                homeUtilityLabel(
                  title: "Upload Debug Fixture",
                  subtitle: "Creates a synthetic upload packet for validation.",
                  systemImage: "hammer"
                )
              }
              .buttonStyle(.plain)

              if let onOpenInputLab {
                Button(action: onOpenInputLab) {
                  homeUtilityLabel(
                    title: "Open Text Input Lab",
                    subtitle: "Developer-only input testing screen.",
                    systemImage: "keyboard"
                  )
                }
                .buttonStyle(.plain)
              }
              #endif

              Button(role: .destructive, action: onSignOut) {
                homeUtilityLabel(
                  title: "Sign Out",
                  subtitle: "Ends the current session on this device.",
                  systemImage: "person.crop.circle.badge.xmark"
                )
              }
              .buttonStyle(.plain)
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
      }
      .navigationTitle("Capture Home")
      .navigationBarTitleDisplayMode(.inline)
      .background {
        LinearGradient(
          colors: [
            Color(red: 0.06, green: 0.07, blue: 0.09),
            Color.black
          ],
          startPoint: .top,
          endPoint: .bottom
        )
        .ignoresSafeArea()
      }
    }
  }

  @ViewBuilder
  private var homeHeader: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Capture Home")
        .font(.largeTitle.weight(.bold))
        .foregroundStyle(.white)

      Text("Keep the workflow moving without putting editing noise in the way.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.bottom, 2)
  }

  private func homeUtilityLabel(title: String, subtitle: String, systemImage: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: systemImage)
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: 24, height: 24)
        .padding(8)
        .background {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(.white.opacity(0.08))
        }

      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
        Text(subtitle)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
  }

  private func queueStateText(_ state: AppState.QueueItemSubmitState) -> String {
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

private struct CaptureHomeCard<Content: View>: View {
  let title: String
  let subtitle: String?
  let content: Content

  init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
    self.title = title
    self.subtitle = subtitle
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
        if let subtitle {
          Text(subtitle)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }

      content
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(.white.opacity(0.06))
    }
    .overlay {
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(.white.opacity(0.1), lineWidth: 1)
    }
  }
}

private struct HomeActionButton: View {
  let title: String
  let systemImage: String
  let accessibilityIdentifier: String?
  let action: () -> Void

  @ViewBuilder
  var body: some View {
    let button = Button(action: action) {
      HStack(spacing: 8) {
        Image(systemName: systemImage)
          .font(.subheadline.weight(.semibold))
        Text(title)
          .font(.subheadline.weight(.semibold))
        Spacer(minLength: 0)
      }
      .padding(.vertical, 12)
      .padding(.horizontal, 14)
      .frame(maxWidth: .infinity)
    }
    let decoratedButton = button
      .buttonStyle(.plain)
      .foregroundStyle(.white)
      .background {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(.white.opacity(0.08))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }

    if let accessibilityIdentifier {
      decoratedButton.accessibilityIdentifier(accessibilityIdentifier)
    } else {
      decoratedButton
    }
  }
}

private struct HomeMetricPill: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
    }
    .padding(.vertical, 10)
    .padding(.horizontal, 12)
    .background {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.white.opacity(0.08))
    }
  }
}

private struct EmptyHomeState: View {
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
      Text(message)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(.white.opacity(0.04))
    }
  }
}

private struct QueuePreviewRow: View {
  let item: AppState.LocalQueueItemPacket
  let progressMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text("Item \(item.itemNumber)")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
        Spacer(minLength: 0)
        Text(submitStateText(item.submitState))
          .font(.caption.weight(.semibold))
          .foregroundStyle(submitStateColor(item.submitState))
      }

      Text("\(item.storeShortCode) · \(item.batchName)")
        .font(.footnote)
        .foregroundStyle(.secondary)
        .lineLimit(1)

      HStack(spacing: 8) {
        HomeMetricPill(label: "Photos", value: "\(item.photos.count)")
        HomeMetricPill(label: "SKU", value: item.sku.isEmpty ? "—" : item.sku)
      }
      .padding(.top, 2)

      if let progressMessage, !progressMessage.isEmpty {
        Text(progressMessage)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(.white.opacity(0.05))
    }
  }

  private func submitStateText(_ state: AppState.QueueItemSubmitState) -> String {
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

  private func submitStateColor(_ state: AppState.QueueItemSubmitState) -> Color {
    switch state {
    case .local, .submitted:
      return .secondary
    case .submitting:
      return .orange
    case .failed:
      return .red
    }
  }
}

private struct MockQueuedItem: Identifiable, Hashable {
  let id = UUID()
  let itemNumber: Int
  let photoCount: Int
  var sku: String
  var weight: String
  var dimensions: String
  let notes: String

  init(
    itemNumber: Int,
    photoCount: Int,
    sku: String = "",
    weight: String = "",
    dimensions: String = "",
    notes: String
  ) {
    self.itemNumber = itemNumber
    self.photoCount = photoCount
    self.sku = sku
    self.weight = weight
    self.dimensions = dimensions
    self.notes = notes
  }
}

private enum MockIntakeFlowStep {
  case camera
  case intake
  case queueReview
}

private struct MockIntakeFlowView: View {
  @Environment(\.dismiss) private var dismiss

  @State private var step: MockIntakeFlowStep = .camera
  @State private var currentItemNumber = 12
  @State private var currentPhotoCount = 4
  @State private var currentSku = ""
  @State private var currentWeight = ""
  @State private var currentDimensions = ""
  @State private var currentNotes = ""
  @State private var latestPhotoSeed: Int? = 4
  @State private var mockSelectedLens = "1x"
  @State private var didRunMockLaunchActions = false
  @State private var queuedItems: [MockQueuedItem] = [
    MockQueuedItem(itemNumber: 12, photoCount: 4, notes: "Small scratch on back cover."),
    MockQueuedItem(itemNumber: 13, photoCount: 3, notes: "Signed title page."),
    MockQueuedItem(itemNumber: 14, photoCount: 5, notes: ""),
    MockQueuedItem(itemNumber: 15, photoCount: 2, notes: "Measure spine."),
    MockQueuedItem(itemNumber: 16, photoCount: 4, notes: ""),
    MockQueuedItem(itemNumber: 17, photoCount: 1, notes: "Check edition.")
  ]

  var body: some View {
    NavigationStack {
      Group {
        switch step {
        case .camera:
          mockCameraScreen
        case .intake:
          mockIntakeScreen
        case .queueReview:
          MockQueueReviewScreen(items: queuedItems)
        }
      }
      .navigationDestination(for: MockQueuedItem.self) { item in
        MockQueuedItemReviewScreen(item: item)
      }
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button(step == .queueReview ? "Main Screen" : "Exit Preview") {
            dismiss()
          }
        }
      }
    }
    .onAppear {
      runMockLaunchActionsIfNeeded()
    }
  }

  private var mockCameraScreen: some View {
    CaptureCameraShell(
      itemNumber: currentItemNumber,
      photoCount: currentPhotoCount,
      notes: $currentNotes,
      canUndo: currentPhotoCount > 0,
      onExit: { dismiss() },
      onUndo: undoMockPhoto,
      onCapture: captureMockPhoto,
      onNext: openMockItemDetails,
      onDone: finishMockCaptureSession,
      previewContent: {
        CaptureCameraPreviewSurface(
          photoCount: currentPhotoCount,
          seed: latestPhotoSeed,
          gridEnabled: true,
          levelEnabled: false,
          selectedLens: mockSelectedLens
        )
      },
      thumbnailContent: {
        CaptureCameraThumbnailPanel(
          seed: latestPhotoSeed,
          hasPhoto: currentPhotoCount > 0,
          photoCount: currentPhotoCount
        )
      }
    )
  }

  private var mockIntakeScreen: some View {
    ItemDetailsScreen(
      itemNumber: currentItemNumber,
      photoCount: currentPhotoCount,
      sku: $currentSku,
      weight: $currentWeight,
      dimensions: $currentDimensions,
      notes: $currentNotes,
      onCancel: { step = .camera },
      onSubmit: submitCurrentMockItem,
      onNextItem: continueToNextMockItem,
      thumbnailContent: {
        CaptureCameraThumbnailPanel(
          seed: latestPhotoSeed,
          hasPhoto: currentPhotoCount > 0,
          photoCount: currentPhotoCount
        )
      }
    )
  }

  private func finalizeCurrentMockItemIfNeeded() {
    guard currentPhotoCount > 0 else { return }
    let trimmedSku = currentSku.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedWeight = currentWeight.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedDimensions = currentDimensions.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedNotes = currentNotes.trimmingCharacters(in: .whitespacesAndNewlines)
    let queuedItem = MockQueuedItem(
      itemNumber: currentItemNumber,
      photoCount: currentPhotoCount,
      sku: trimmedSku,
      weight: trimmedWeight,
      dimensions: trimmedDimensions,
      notes: trimmedNotes
    )
    queuedItems.removeAll { $0.itemNumber == queuedItem.itemNumber }
    queuedItems.insert(queuedItem, at: 0)
  }

  private func captureMockPhoto() {
    currentPhotoCount += 1
    latestPhotoSeed = currentItemNumber + currentPhotoCount
  }

  private func openMockItemDetails() {
    guard currentPhotoCount > 0 else { return }
    step = .intake
  }

  private func advanceMockItem() {
    currentItemNumber += 1
    currentPhotoCount = 0
    currentSku = ""
    currentWeight = ""
    currentDimensions = ""
    currentNotes = ""
    latestPhotoSeed = nil
  }

  private func undoMockPhoto() {
    guard currentPhotoCount > 0 else { return }
    currentPhotoCount -= 1
    latestPhotoSeed = currentPhotoCount > 0 ? currentItemNumber + currentPhotoCount : nil
  }

  private func finishMockCaptureSession() {
    guard currentPhotoCount > 0 else { return }
    step = .intake
  }

  private func submitCurrentMockItem() {
    finalizeCurrentMockItemIfNeeded()
    step = .queueReview
  }

  private func continueToNextMockItem() {
    finalizeCurrentMockItemIfNeeded()
    advanceMockItem()
    step = .camera
  }

  private func runMockLaunchActionsIfNeeded() {
    #if DEBUG
    guard !didRunMockLaunchActions else { return }
    didRunMockLaunchActions = true

    guard let actionIndex = ProcessInfo.processInfo.arguments.firstIndex(of: "-mock-intake-actions"),
          ProcessInfo.processInfo.arguments.indices.contains(actionIndex + 1)
    else {
      return
    }

    let actions = ProcessInfo.processInfo.arguments[actionIndex + 1]
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    for action in actions {
      switch action {
      case "capture":
        captureMockPhoto()
      case "next":
        openMockItemDetails()
      case "next-item":
        continueToNextMockItem()
      case "submit":
        submitCurrentMockItem()
      default:
        continue
      }
    }
    #endif
  }
}

private struct MockQueueReviewScreen: View {
  let items: [MockQueuedItem]

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        MockFlowHero(
          eyebrow: "Queue Review",
          title: "Finished item cards",
          message: "This is the landing page after `Submit`. Tap a card to inspect the item and its photos."
        )

        Text("\(items.count) items")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.secondary)

        LazyVGrid(
          columns: [
            GridItem(.flexible(), spacing: 12, alignment: .top),
            GridItem(.flexible(), spacing: 12, alignment: .top)
          ],
          spacing: 12
        ) {
          // Order is left-to-right, top-to-bottom so the oldest item appears first.
          ForEach(items.sorted(by: { $0.itemNumber < $1.itemNumber })) { item in
            NavigationLink(value: item) {
              MockQueueItemCard(item: item)
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(16)
    }
    .background(MockFlowBackground())
    .navigationTitle("Queue Review")
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("queueReview.screen")
  }
}

private struct MockQueuedItemReviewScreen: View {
  let item: MockQueuedItem

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        MockFlowHero(
          eyebrow: "Item Review",
          title: "Item \(item.itemNumber)",
          message: "Minimal item review page with the item photos and optional notes."
        )

        MockSurfaceCard {
          VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
              MockStatusChip(title: "\(item.photoCount) Photos")
              MockStatusChip(title: item.notes.isEmpty ? "No Notes" : "Notes")
            }

            MockPhotoGrid(photoCount: item.photoCount)

            VStack(alignment: .leading, spacing: 6) {
              Text("Notes")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
              Text(item.notes.isEmpty ? "No notes added for this item yet." : item.notes)
                .font(.subheadline)
                .foregroundColor(item.notes.isEmpty ? .secondary : .white.opacity(0.9))
            }
          }
        }
      }
      .padding(16)
    }
    .background(MockFlowBackground())
    .navigationTitle("Item \(item.itemNumber)")
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct MockItemCard: View {
  let item: MockQueuedItem

  var body: some View {
    MockSurfaceCard {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .firstTextBaseline) {
          VStack(alignment: .leading, spacing: 4) {
            Text("Item \(item.itemNumber)")
              .font(.headline.weight(.semibold))
              .foregroundStyle(.white)
            Text("\(item.photoCount) photo(s)")
              .font(.footnote)
              .foregroundStyle(.secondary)
          }

          Spacer(minLength: 0)

          Image(systemName: "chevron.right")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
        }

        MockPhotoGrid(photoCount: item.photoCount)

        Text(item.notes.isEmpty ? "No notes yet" : item.notes)
          .font(.subheadline)
          .foregroundColor(item.notes.isEmpty ? .secondary : .white.opacity(0.9))
          .lineLimit(1)
      }
    }
  }
}

private struct MockQueueItemCard: View {
  let item: MockQueuedItem

  var body: some View {
    MockSurfaceCard {
      VStack(alignment: .leading, spacing: 12) {
        MockCoverTile(seed: item.itemNumber)
          .frame(maxWidth: .infinity)
          .frame(height: 126)

        VStack(alignment: .leading, spacing: 4) {
          Text("Item \(item.itemNumber)")
            .font(.title3.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
          Text("\(item.photoCount) photos")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }

        Text(item.notes.isEmpty ? "No notes yet" : item.notes)
          .font(.subheadline)
          .foregroundColor(item.notes.isEmpty ? .secondary : .white.opacity(0.9))
          .lineLimit(1)

        Spacer(minLength: 0)

        HStack {
          Spacer(minLength: 0)
          Image(systemName: "ellipsis")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, minHeight: 264, maxHeight: 264, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct MockFlowHero: View {
  let eyebrow: String
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(eyebrow.uppercased())
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(title)
        .font(.largeTitle.weight(.bold))
        .foregroundStyle(.white)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct MockSurfaceCard<Content: View>: View {
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(.white.opacity(0.06))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
  }
}

private struct MockCoverTile: View {
  let seed: Int

  var body: some View {
    MockTileGradient(index: seed)
      .overlay(alignment: .topTrailing) {
        Image(systemName: "photo")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white.opacity(0.9))
          .padding(8)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
  }
}

private struct MockPreviewTopBar: View {
  let itemNumber: Int
  let photoCount: Int
  let onExit: () -> Void
  let canUndo: Bool
  let onUndo: () -> Void
  let onDone: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      MockTopCapsuleButton(title: "Exit", systemName: "chevron.left", action: onExit)

      if canUndo {
        MockTopCapsuleButton(title: "Undo", systemName: "arrow.uturn.backward", action: onUndo)
      }

      Spacer(minLength: 0)

      VStack(alignment: .trailing, spacing: 6) {
        VStack(alignment: .trailing, spacing: 2) {
          Text("Item \(itemNumber)")
            .font(.headline.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
          Text("\(photoCount) photo\(photoCount == 1 ? "" : "s")")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }

        MockTopCapsuleButton(title: "Done", systemName: nil, isFilled: true, foreground: .black, action: onDone)
      }
    }
  }
}

private struct MockLivePreviewSurface: View {
  let photoCount: Int
  let seed: Int?
  let gridEnabled: Bool
  let levelEnabled: Bool
  let selectedLens: String

  var body: some View {
    RoundedRectangle(cornerRadius: 22, style: .continuous)
      .fill(
        LinearGradient(
          colors: [
            Color(red: 0.12, green: 0.12, blue: 0.14),
            Color(red: 0.06, green: 0.06, blue: 0.07)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
      .aspectRatio(1, contentMode: .fit)
      .overlay {
        if let seed, photoCount > 0 {
          MockCameraScene(seed: seed)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(10)
        }
      }
      .overlay {
        MockViewfinderCorners()
          .padding(16)
      }
      .overlay {
        if gridEnabled {
          MockPreviewGrid()
          .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
      }
      .overlay {
        Circle()
          .stroke(.white.opacity(0.92), lineWidth: 2)
          .frame(width: 70, height: 70)
      }
      .overlay {
        if levelEnabled {
          Rectangle()
            .fill(.white.opacity(0.5))
            .frame(height: 2)
            .padding(.horizontal, 18)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        Text(selectedLens)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(.white)
          .padding(.horizontal, 13)
          .padding(.vertical, 9)
          .background {
            Capsule(style: .continuous)
              .fill(.black.opacity(0.52))
          }
          .overlay {
            Capsule(style: .continuous)
              .stroke(.white.opacity(0.78), lineWidth: 1.6)
          }
          .padding(.trailing, 16)
          .padding(.bottom, 16)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(.white.opacity(0.10), lineWidth: 1)
      }
  }
}

private struct MockPreviewGrid: View {
  var body: some View {
    GeometryReader { geometry in
      Path { path in
        let width = geometry.size.width
        let height = geometry.size.height

        path.move(to: CGPoint(x: width / 3, y: 0))
        path.addLine(to: CGPoint(x: width / 3, y: height))

        path.move(to: CGPoint(x: 2 * width / 3, y: 0))
        path.addLine(to: CGPoint(x: 2 * width / 3, y: height))

        path.move(to: CGPoint(x: 0, y: height / 3))
        path.addLine(to: CGPoint(x: width, y: height / 3))

        path.move(to: CGPoint(x: 0, y: 2 * height / 3))
        path.addLine(to: CGPoint(x: width, y: 2 * height / 3))
      }
      .stroke(.white.opacity(0.38), lineWidth: 1)
    }
  }
}

private struct MockVerticalZoomSlider: View {
  var body: some View {
    ZStack {
      Capsule(style: .continuous)
        .fill(.black.opacity(0.45))
        .frame(width: 6)

      Capsule(style: .continuous)
        .fill(.white.opacity(0.1))
        .frame(width: 1)

      Circle()
        .fill(Color(.systemGray3))
        .frame(width: 22, height: 22)
        .overlay {
          Circle()
            .stroke(.white.opacity(0.35), lineWidth: 1)
        }
        .offset(y: 34)
    }
    .frame(width: 34, height: 176)
    .opacity(0.34)
  }
}

private struct MockViewfinderCorners: View {
  var body: some View {
    ZStack {
      corner(x: .leading, y: .top, rotation: 0)
      corner(x: .trailing, y: .top, rotation: 90)
      corner(x: .leading, y: .bottom, rotation: 270)
      corner(x: .trailing, y: .bottom, rotation: 180)
    }
  }

  private func corner(x: HorizontalAlignment, y: VerticalAlignment, rotation: Double) -> some View {
    RoundedRectangle(cornerRadius: 4, style: .continuous)
      .stroke(.white.opacity(0.92), lineWidth: 2)
      .frame(width: 18, height: 18)
      .mask(
        VStack {
          if y == .top { Spacer() }
          HStack {
            if x == .leading { Spacer() }
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(.white)
              .frame(width: 18, height: 18)
            if x == .trailing { Spacer() }
          }
          if y == .bottom { Spacer() }
        }
      )
      .rotationEffect(.degrees(rotation))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment(x: x, y: y))
  }

  private func alignment(x: HorizontalAlignment, y: VerticalAlignment) -> Alignment {
    switch (x, y) {
    case (.leading, .top): return .topLeading
    case (.trailing, .top): return .topTrailing
    case (.leading, .bottom): return .bottomLeading
    case (.trailing, .bottom): return .bottomTrailing
    default: return .center
    }
  }
}

private struct MockLatestPhotoPanel: View {
  let seed: Int?
  let hasPhoto: Bool
  let photoCount: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Group {
        if let seed, hasPhoto {
          MockCameraScene(seed: seed)
        } else {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(.white.opacity(0.08))
            .overlay {
              Image(systemName: "photo")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.secondary)
            }
        }
      }
      .frame(width: 72, height: 72)
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
      .overlay(alignment: .topTrailing) {
        if hasPhoto {
          Text("#\(photoCount)")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background {
              Capsule(style: .continuous)
                .fill(.black.opacity(0.55))
            }
            .padding(6)
        }
      }

      Text(hasPhoto ? "Last photo" : "No photo")
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
    }
  }
}

private struct MockCameraScene: View {
  let seed: Int

  private var bookColor: Color {
    switch seed % 4 {
    case 0:
      return Color(red: 0.40, green: 0.27, blue: 0.18)
    case 1:
      return Color(red: 0.18, green: 0.32, blue: 0.40)
    case 2:
      return Color(red: 0.46, green: 0.22, blue: 0.16)
    default:
      return Color(red: 0.32, green: 0.30, blue: 0.18)
    }
  }

  var body: some View {
    GeometryReader { geometry in
      let width = geometry.size.width
      let height = geometry.size.height

      ZStack {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(
            LinearGradient(
              colors: [
                Color(red: 0.28, green: 0.20, blue: 0.15),
                Color(red: 0.17, green: 0.12, blue: 0.10)
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          )

        VStack(spacing: 0) {
          ForEach(0 ..< 7, id: \.self) { row in
            Rectangle()
              .fill(row.isMultiple(of: 2) ? .white.opacity(0.06) : .black.opacity(0.10))
              .frame(height: height / 7.5)
          }
        }
        .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -11 : -8))
        .scaleEffect(1.18)

        RoundedRectangle(cornerRadius: width * 0.07, style: .continuous)
          .fill(bookColor)
          .frame(width: width * 0.44, height: height * 0.23)
          .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -16 : -11))
          .offset(x: -width * 0.09, y: height * 0.11)
          .shadow(color: .black.opacity(0.25), radius: 18, x: 0, y: 14)
          .overlay(alignment: .leading) {
            Rectangle()
              .fill(.white.opacity(0.18))
              .frame(width: width * 0.03)
              .padding(.vertical, 8)
          }

        RoundedRectangle(cornerRadius: width * 0.035, style: .continuous)
          .fill(Color(red: 0.31, green: 0.34, blue: 0.38))
          .frame(width: width * 0.32, height: height * 0.15)
          .rotationEffect(.degrees(seed.isMultiple(of: 2) ? -19 : -14))
          .offset(x: width * 0.18, y: -height * 0.01)
          .shadow(color: .black.opacity(0.25), radius: 16, x: 0, y: 12)
          .overlay {
            Circle()
              .stroke(.white.opacity(0.55), lineWidth: 3)
              .frame(width: width * 0.11, height: width * 0.11)
          }

        LinearGradient(
          colors: [.clear, .black.opacity(0.22)],
          startPoint: .top,
          endPoint: .bottom
        )
      }
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
  }
}

private struct MockTopCapsuleButton: View {
  let title: String
  let systemName: String?
  var isFilled = false
  var foreground: Color = .white
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let systemName {
          Image(systemName: systemName)
            .font(.subheadline.weight(.semibold))
        }
        Text(title)
          .font(.subheadline.weight(.medium))
      }
      .foregroundStyle(foreground)
      .padding(.horizontal, 14)
      .padding(.vertical, 9)
      .background {
        Capsule(style: .continuous)
          .fill(isFilled ? .white : .white.opacity(0.08))
      }
      .overlay {
        Capsule(style: .continuous)
          .stroke(isFilled ? .clear : .white.opacity(0.1), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
  }
}

private struct MockCircleIconButton: View {
  let systemName: String
  var isActive = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(isActive ? .black : .white)
        .frame(width: 40, height: 40)
        .background {
          Circle()
            .fill(isActive ? .white : .white.opacity(0.10))
        }
        .overlay {
          Circle()
            .stroke(.white.opacity(isActive ? 0 : 0.15), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
  }
}

private struct MockPhotoGrid: View {
  let photoCount: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Mock photo set")
        .font(.headline.weight(.semibold))
        .foregroundStyle(.white)

      LazyVGrid(columns: Array(repeating: .init(.flexible(), spacing: 8), count: 2), spacing: 8) {
        ForEach(0 ..< max(photoCount, 1), id: \.self) { index in
          MockPhotoTile(index: index)
        }
      }
    }
  }
}

private struct MockPhotoTile: View {
  let index: Int

  var body: some View {
    MockTileGradient(index: index)
      .aspectRatio(1, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .clipped()
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(.white.opacity(0.08), lineWidth: 1)
      }
      .overlay(alignment: .bottomLeading) {
        Text("Photo \(index + 1)")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white)
          .padding(8)
      }
  }

  private func gradientColors(for index: Int) -> [Color] {
    switch index % 4 {
    case 0:
      return [Color(red: 0.76, green: 0.44, blue: 0.26), Color(red: 0.34, green: 0.20, blue: 0.14)]
    case 1:
      return [Color(red: 0.24, green: 0.54, blue: 0.64), Color(red: 0.10, green: 0.22, blue: 0.31)]
    case 2:
      return [Color(red: 0.49, green: 0.39, blue: 0.62), Color(red: 0.20, green: 0.15, blue: 0.29)]
    default:
      return [Color(red: 0.40, green: 0.58, blue: 0.28), Color(red: 0.15, green: 0.24, blue: 0.12)]
    }
  }
}

private struct MockTileGradient: View {
  let index: Int

  var body: some View {
    RoundedRectangle(cornerRadius: 14, style: .continuous)
      .fill(
        LinearGradient(
          colors: gradientColors(for: index),
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
  }

  private func gradientColors(for index: Int) -> [Color] {
    switch index % 4 {
    case 0:
      return [Color(red: 0.76, green: 0.44, blue: 0.26), Color(red: 0.34, green: 0.20, blue: 0.14)]
    case 1:
      return [Color(red: 0.24, green: 0.54, blue: 0.64), Color(red: 0.10, green: 0.22, blue: 0.31)]
    case 2:
      return [Color(red: 0.49, green: 0.39, blue: 0.62), Color(red: 0.20, green: 0.15, blue: 0.29)]
    default:
      return [Color(red: 0.40, green: 0.58, blue: 0.28), Color(red: 0.15, green: 0.24, blue: 0.12)]
    }
  }
}

private struct MockStatusChip: View {
  let title: String

  var body: some View {
    Text(title)
      .font(.caption.weight(.semibold))
      .foregroundStyle(.white)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background {
        Capsule()
          .fill(.white.opacity(0.08))
      }
  }
}

private struct MockFlowBackground: View {
  var body: some View {
    LinearGradient(
      colors: [
        Color(red: 0.07, green: 0.08, blue: 0.10),
        Color.black
      ],
      startPoint: .top,
      endPoint: .bottom
    )
    .ignoresSafeArea()
  }
}

private struct QueueReviewSheet: View {
  @EnvironmentObject private var appState: AppState
  @Environment(\.dismiss) private var dismiss
  let onOpenCamera: () -> Void
  let onSubmit: () async -> Bool

  var body: some View {
    NavigationStack {
      List {
        Section {
          Button("Submit") {
            Task {
              if await onSubmit() {
                dismiss()
              }
            }
          }
          .disabled(appState.queueEligibleForSubmit().isEmpty)
          .accessibilityIdentifier("queueReview.submit")
        }

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
      .accessibilityIdentifier("queueReview.screen")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Main Screen") { dismiss() }
            .accessibilityIdentifier("queueReview.mainScreen")
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
  let onOpenQueueReview: () -> Void

  @State private var showingContext = false
  @State private var pinchStartZoom: Double?
  @State private var isCaptureLoopRunning = false
  @State private var pendingCaptureCount = 0
  private let maxPendingCaptures = 2

  private var isEditingOverlayPresented: Bool {
    showingContext || showingDetails
  }

  var body: some View {
    VStack(spacing: 4) {
      CameraTopBar(
        title: "Item \(appState.currentItemNumber)",
        photoCount: appState.capturedPhotos.count,
        onBack: onBack,
        onDone: {
          guard !appState.capturedPhotos.isEmpty else {
            onDone()
            return
          }
          presentDetailsEditor()
        }
      )

      CameraContextStrip(
        storeName: appState.captureStoreName,
        storeShortCode: appState.captureStoreShortCode,
        batchName: appState.captureBatchName,
        itemNumber: appState.currentItemNumber,
        onStoreBatchTap: { presentContextEditor() },
        onItemTap: { presentDetailsEditor() }
      )
      .padding(.horizontal, 12)
      .layoutPriority(0)

      Group {
        if isEditingOverlayPresented {
          cameraPreviewPlaceholder
        } else {
          VStack(spacing: 4) {
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
            .layoutPriority(1)

            ZoomControlRow(
              currentZoom: cameraService.currentZoom,
              minZoom: cameraService.minZoom,
              maxZoom: cameraService.userFacingMaxZoom,
              onZoomChange: updateZoom,
              formatZoom: formatZoom
            )
          }
        }
      }
      .frame(maxHeight: .infinity)
      .padding(.horizontal, 12)
      .layoutPriority(1)

      GuideToggleRow(
        gridEnabled: $cameraPreferences.gridEnabled,
        horizonGuideEnabled: $cameraPreferences.horizonGuideEnabled,
        showsTapToFocusHint: cameraService.supportsFocusPoint || cameraService.supportsExposurePoint
      )
      .layoutPriority(0)

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
          guard !appState.capturedPhotos.isEmpty else {
            appState.statusMessage = "Capture at least one photo before continuing."
            return
          }
          presentDetailsEditor()
        }
      )
      .layoutPriority(0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Color.black.ignoresSafeArea())
    .accessibilityIdentifier("liveCamera.screen")
    .padding(.bottom, 6)
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
      NavigationStack {
        ItemDetailsScreen(
          itemNumber: appState.currentItemNumber,
          photoCount: appState.capturedPhotos.count,
          sku: currentItemBinding(\.currentItemSku),
          weight: currentItemBinding(\.currentItemWeight),
          dimensions: currentItemBinding(\.currentItemDimensions),
          notes: currentItemBinding(\.currentItemNotes),
          onCancel: {
            showingDetails = false
          },
          onSubmit: {
            guard !appState.capturedPhotos.isEmpty else {
              appState.statusMessage = "Capture at least one photo before submitting."
              return
            }
            appState.advanceToNextItem()
            showingDetails = false
            onOpenQueueReview()
          },
          onNextItem: {
            guard !appState.capturedPhotos.isEmpty else {
              appState.statusMessage = "Capture at least one photo before continuing."
              return
            }
            appState.advanceToNextItem()
            showingDetails = false
          },
          thumbnailContent: {
            liveItemDetailsThumbnail
          }
        )
      }
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

  @ViewBuilder
  private var liveItemDetailsThumbnail: some View {
    if let thumbnailImage = appState.capturedPhotos.last?.thumbnailImage {
      Image(uiImage: thumbnailImage)
        .resizable()
        .scaledToFill()
        .frame(height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(.white.opacity(0.12), lineWidth: 1)
        }
    } else {
      CaptureCameraThumbnailPanel(
        seed: nil,
        hasPhoto: false,
        photoCount: appState.capturedPhotos.count
      )
    }
  }

  private func currentItemBinding(_ keyPath: ReferenceWritableKeyPath<AppState, String>) -> Binding<String> {
    Binding(
      get: { appState[keyPath: keyPath] },
      set: { appState[keyPath: keyPath] = $0 }
    )
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
