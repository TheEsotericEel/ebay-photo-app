import SwiftUI

struct RootView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var cameraService = CameraService()
  @StateObject private var cameraPreferences = CameraPreferencesStore()
  @State private var showingCamera = false
  @State private var showingDetails = false

  private let supabase = SupabaseService()
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
              Task {
                do {
                  try await supabase.uploadCurrentBatch()
                  appState.uploadMessage = "Upload not wired yet, but the call path is ready."
                } catch {
                  appState.uploadMessage = error.localizedDescription
                }
              }
            },
            onSignOut: {
              if shouldBypassAuth {
                appState.statusMessage = "Development auth bypass stays enabled."
              } else {
                appState.isAuthenticated = false
              }
            }
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
          }
        )
      }
    }
  }
}

private struct AuthView: View {
  @Binding var email: String
  @Binding var code: String
  let statusMessage: String
  let errorMessage: String
  let onSendCode: () -> Void
  let onSignIn: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        Section("Sign In") {
          TextField("Email", text: $email)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

          Button("Send OTP Code", action: onSendCode)

          TextField("Code", text: $code)
            .keyboardType(.numberPad)

          Button("Sign In", action: onSignIn)
        }

        Section("Status") {
          Text(statusMessage)
          if !errorMessage.isEmpty {
            Text(errorMessage)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("Ebay Photo App")
    }
  }
}

private struct CaptureHomeView: View {
  let onOpenCamera: () -> Void
  let onUploadBatch: () -> Void
  let onSignOut: () -> Void
  @EnvironmentObject private var appState: AppState

  var body: some View {
    NavigationStack {
      List {
        Section("Active Batch") {
          LabeledContent("Store", value: appState.activeStore)
          LabeledContent("Batch", value: appState.activeBatch)
          LabeledContent("Item", value: "\(appState.currentItemNumber)")
          LabeledContent("Photos", value: "\(appState.capturedPhotos.count)")
        }

        Section("Actions") {
          Button("Open Camera", action: onOpenCamera)
          Button("Upload Batch", action: onUploadBatch)
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

  @State private var pinchStartZoom: Double?

  var body: some View {
    VStack(spacing: 8) {
      CameraTopBar(
        itemNumber: appState.currentItemNumber,
        photoCount: appState.capturedPhotos.count,
        onBack: onBack,
        onDetails: { showingDetails = true }
      )
      .padding(.top, 4)

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
        onToggleLockForSelectedLens: { _ in
          cameraPreferences.switchingMode = cameraPreferences.switchingMode == .auto ? .locked : .auto
          reconfigureCamera()
        }
      )
      .frame(maxHeight: .infinity)
      .padding(.top, 4)

      ZoomControlRow(
        currentZoom: cameraService.currentZoom,
        minZoom: cameraService.minZoom,
        maxZoom: min(cameraService.maxZoom, 10.0),
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
        canCapture: cameraService.canCapture,
        onUndo: {
          appState.undoLastCapture()
        },
        onCapture: {
          Task {
            do {
              let photo = try await cameraService.capturePhoto(aspectMode: cameraPreferences.aspectMode)
              appState.capturedPhotos.append(photo)
              appState.statusMessage = "Captured \(appState.capturedPhotos.count) photo(s)"
            } catch {
              appState.statusMessage = "Capture failed: \(error.localizedDescription)"
            }
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
    .sheet(isPresented: $showingDetails) {
      NavigationStack {
        Form {
          Section("Item Details") {
            TextField("SKU", text: $appState.currentItemSku)
            TextField("Weight", text: $appState.currentItemWeight)
            TextField("Dimensions", text: $appState.currentItemDimensions)
          }
        }
        .navigationTitle("Details")
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button("Done") { showingDetails = false }
          }
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
    let clamped = min(max(zoom, cameraService.minZoom), max(cameraService.maxZoom, cameraService.minZoom))
    cameraPreferences.setZoom(clamped, for: lens)
    cameraService.setZoom(clamped)
  }

  private func formatZoom(_ zoom: Double) -> String {
    if zoom < 1 {
      return String(format: "%.1fx", zoom)
    }
    let whole = zoom.rounded(.towardZero)
    if abs(zoom - whole) < 0.05 {
      return String(format: "%.0fx", zoom)
    }
    return String(format: "%.1fx", zoom)
  }
}
