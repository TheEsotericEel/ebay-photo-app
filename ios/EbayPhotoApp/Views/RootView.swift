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
                HomeActionButton(title: "Review Queue", systemImage: "tray.full", action: onReviewQueue)
                HomeActionButton(title: "Upload Batch", systemImage: "arrow.up.circle", action: onUploadBatch)
              }
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
  let action: () -> Void

  var body: some View {
    Button(action: action) {
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
    VStack(spacing: 4) {
      CameraTopBar(
        title: "Item \(appState.currentItemNumber)",
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

      CameraMetadataTray(
        sku: currentItemBinding(\.currentItemSku),
        weight: currentItemBinding(\.currentItemWeight),
        dimensions: currentItemBinding(\.currentItemDimensions),
        notes: currentItemBinding(\.currentItemNotes)
      )
      .padding(.horizontal, 12)
      .layoutPriority(0)

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
          appState.advanceToNextItem()
        },
        onDone: onDone
      )
      .layoutPriority(0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(Color.black.ignoresSafeArea())
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
