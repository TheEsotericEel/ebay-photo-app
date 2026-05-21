import SwiftUI
import UIKit

struct RootView: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var supabase: SupabaseService
  @StateObject private var cameraService = CameraService()
  @StateObject private var cameraPreferences = CameraPreferencesStore()
  @State private var showingCamera = false
  @State private var showingDetails = false
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
              appState.statusMessage = "Uploading batch…"
              appState.uploadMessage = ""
              Task {
                do {
                  let packet = try makeUploadPacket()
                  let result = try await supabase.uploadItemPacket(packet)
                  appState.uploadMessage = "Uploaded item \(appState.currentItemNumber) (\(result.photoIdByLocalPhotoId.count) photo(s))."
                } catch {
                  appState.uploadMessage = error.localizedDescription
                }
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
                  appState.uploadMessage = "Fixture uploaded (\(result.photoIdByLocalPhotoId.count) photo(s))."
                  appState.statusMessage = "Debug fixture upload completed."
                } catch {
                  appState.uploadMessage = error.localizedDescription
                  appState.statusMessage = "Debug fixture upload failed."
                }
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
  }

  private func makeUploadPacket() throws -> NativeUploadItemPacketV1 {
    guard !appState.capturedPhotos.isEmpty else {
      throw AppServiceError.invalidRequest("Capture at least one photo before uploading.")
    }

    let formatter = ISO8601DateFormatter()
    let photos = try appState.capturedPhotos.enumerated().map { index, photo in
      guard let listingImage = UIImage(data: photo.data) else {
        throw AppServiceError.invalidRequest("Photo \(index + 1) is invalid.")
      }
      let thumbnailData = photo.thumbnailData ?? listingImage.ebp_thumbnailData()
      guard let thumbnailData, let thumbnailImage = UIImage(data: thumbnailData) else {
        throw AppServiceError.invalidRequest("Unable to build thumbnail for photo \(index + 1).")
      }

      return NativeUploadItemPacketV1.Photo(
        localPhotoId: photo.id.uuidString,
        orderIndex: index,
        capturedAtISO8601: formatter.string(from: photo.capturedAt),
        listing: .init(
          bytes: photo.data,
          mimeType: "image/jpeg",
          width: pixelWidth(from: listingImage),
          height: pixelHeight(from: listingImage)
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
      store: .init(
        shortCode: appState.captureStoreShortCode,
        name: appState.captureStoreName
      ),
      batch: .init(
        name: appState.captureBatchName,
        status: "active"
      ),
      item: .init(
        sequence: appState.currentItemNumber,
        status: "new",
        sku: appState.currentItemSku.nonEmpty,
        notes: appState.currentItemNotes.nonEmpty,
        weight: appState.currentItemWeight.nonEmpty,
        dimensions: appState.currentItemDimensions.nonEmpty,
        listedAtISO8601: nil
      ),
      photos: photos
    )
  }

  private func pixelWidth(from image: UIImage) -> Int? {
    if let cgImage = image.cgImage { return cgImage.width }
    let value = Int((image.size.width * image.scale).rounded())
    return value > 0 ? value : nil
  }

  private func pixelHeight(from image: UIImage) -> Int? {
    if let cgImage = image.cgImage { return cgImage.height }
    let value = Int((image.size.height * image.scale).rounded())
    return value > 0 ? value : nil
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
      store: .init(shortCode: input.captureStoreShortCode, name: input.captureStoreName),
      batch: .init(name: input.captureBatchName, status: "active"),
      item: .init(
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
            Text("Sign In (recommended)")
              .font(.headline)
            Text(
              "Password sign-in does not send email. OTP and account creation count toward Supabase email limits (~few per hour on built-in SMTP)."
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
            LabeledTextField(title: "Password", text: $password, isSecure: true)
            Button("Sign In with Password", action: onSignInWithPassword)
              .buttonStyle(.borderedProminent)
          }

          VStack(alignment: .leading, spacing: 8) {
            Text("Email OTP (rate limited)")
              .font(.headline)
            Button("Send OTP Code", action: onSendCode)
              .buttonStyle(.bordered)
            LabeledTextField(title: "Code", text: $code, keyboardType: .numberPad)
            Button("Sign In with OTP Code", action: onSignIn)
              .buttonStyle(.borderedProminent)
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

private extension String {
  var nonEmpty: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}

private struct CaptureHomeView: View {
  let onOpenCamera: () -> Void
  let onUploadBatch: () -> Void
  let onUploadFixture: () -> Void
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
          LabeledContent("Photos", value: "\(appState.capturedPhotos.count)")
        }

        Section("Actions") {
          Button("Open Camera", action: onOpenCamera)
          Button("Upload Batch", action: onUploadBatch)
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
        }
      }
      .navigationTitle("Capture Home")
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
    VStack(spacing: 8) {
      CameraTopBar(
        contextLabel: appState.captureContextChipLabel,
        photoCount: appState.capturedPhotos.count,
        onBack: onBack,
        onContext: { presentContextEditor() },
        onDetails: { presentDetailsEditor() }
      )
      .padding(.top, 4)

      Group {
        if isEditingOverlayPresented {
          cameraPreviewPlaceholder
        } else {
          CameraPreviewArea(
            session: cameraService.session,
            cameraService: cameraService,
            cameraPreferences: cameraPreferences,
            pinchStartZoom: $pinchStartZoom,
            thumbnailImage: appState.capturedPhotos.last?.thumbnailImage,
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
      .padding(.top, 4)

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
        canUndo: !appState.capturedPhotos.isEmpty,
        canCapture: cameraService.canCapture || (isCaptureLoopRunning && pendingCaptureCount < maxPendingCaptures),
        onUndo: {
          appState.undoLastCapture()
        },
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

  private func startCaptureLoop() {
    guard !isCaptureLoopRunning else { return }
    isCaptureLoopRunning = true
    
    Task {
      while true {
        do {
          let photo = try await cameraService.capturePhoto(aspectMode: cameraPreferences.aspectMode)
          appState.capturedPhotos.append(photo)
          appState.statusMessage = "Captured \(appState.capturedPhotos.count) photo(s)"
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
