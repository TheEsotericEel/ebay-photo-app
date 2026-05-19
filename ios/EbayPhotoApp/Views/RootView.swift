import SwiftUI
import UIKit

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
    VStack(spacing: 10) {
      topBar

      previewSection

      zoomSection

      guideSection

      actionBar

      if let status = appState.statusMessage.nonEmpty {
        Text(status)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal)
      }

      #if DEBUG
      DisclosureGroup("Debug") {
        VStack(alignment: .leading, spacing: 8) {
          Text(cameraService.debugSummary)
            .font(.footnote)
          Text("Device: \(cameraService.activeDeviceLabel)")
            .font(.footnote)
          Text("Probe: \(cameraService.capabilityProbe.selectedDeviceType) | \(cameraService.capabilityProbe.activeDeviceId)")
            .font(.footnote)
          Text("Zoom: \(String(format: "%.2f", cameraService.currentZoom)) [\(String(format: "%.2f", cameraService.minZoom))-\(String(format: "%.2f", cameraService.maxZoom))]")
            .font(.footnote)
          if let reason = cameraService.capabilityProbe.fallbackReason {
            Text("Fallback: \(reason)")
              .font(.footnote)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal)
      #endif
    }
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

  private var topBar: some View {
    HStack {
      Button("Back", action: onBack)

      Spacer()

      VStack(spacing: 2) {
        Text("Item \(appState.currentItemNumber)")
          .font(.headline)
        Text("\(appState.capturedPhotos.count) photo(s)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Button("Details") { showingDetails = true }
    }
    .padding(.horizontal)
    .padding(.top, 4)
  }

  private var previewSection: some View {
    ZStack(alignment: .bottomTrailing) {
      CameraPreviewView(session: cameraService.session)
        .frame(maxWidth: .infinity)
        .aspectRatio(3 / 4, contentMode: .fit)
        .background(.black)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
          PreviewInteractionLayer(
            cameraService: cameraService,
            cameraPreferences: cameraPreferences,
            pinchStartZoom: $pinchStartZoom
          )
        }
        .padding(.horizontal)

      if cameraPreferences.gridEnabled || cameraPreferences.squareGuideEnabled || cameraPreferences.horizonGuideEnabled {
        CameraGuideOverlay(
          gridEnabled: cameraPreferences.gridEnabled,
          squareGuideEnabled: cameraPreferences.squareGuideEnabled,
          horizonGuideEnabled: cameraPreferences.horizonGuideEnabled
        )
        .padding(.horizontal)
      }

      if let indicator = cameraService.focusIndicator {
        GeometryReader { proxy in
          FocusIndicatorView(indicator: indicator)
            .position(
              x: min(max(indicator.normalizedPoint.x * proxy.size.width, 24), proxy.size.width - 24),
              y: min(max(indicator.normalizedPoint.y * proxy.size.height, 24), proxy.size.height - 24)
            )
        }
      }

      if let thumbnail = appState.capturedPhotos.last?.thumbnailImage {
        VStack {
          Spacer()
          HStack {
            thumbnailPreview(thumbnail)
            Spacer()
          }
        }
        .padding(.leading, 20)
        .padding(.bottom, 28)
      }

      lensSelector
        .padding(.trailing, 24)
        .padding(.bottom, 28)
    }
    .padding(.top, 4)
  }

  private var lensSelector: some View {
    HStack(spacing: 8) {
      lensChip(.ultraWide)
      lensChip(.wide)
    }
    .padding(8)
    .background(.black.opacity(0.22))
    .clipShape(Capsule(style: .continuous))
    .overlay(
      Capsule(style: .continuous)
        .stroke(.white.opacity(0.15), lineWidth: 1)
    )
  }

  private func lensChip(_ lens: CameraLensPreset) -> some View {
    let isSelected = cameraPreferences.preferredLens == lens
    let isLocked = isSelected && cameraPreferences.switchingMode == .locked
    let supported = cameraService.supportedLenses.isEmpty || cameraService.supportedLenses.contains(lens)

    return Button {
      guard supported else { return }
      cameraPreferences.preferredLens = lens
      reconfigureCamera()
    } label: {
      VStack(spacing: 2) {
        Text(lens.rawValue)
          .font(.headline.weight(.semibold))
          .frame(width: 40, height: 32)

        Text(isLocked ? "LOCK" : "AUTO")
          .font(.caption2.weight(.semibold))
          .tracking(0.6)
          .opacity(isSelected ? 1 : 0.55)
      }
      .foregroundStyle(isSelected ? .black : .white)
      .padding(.vertical, 4)
      .padding(.horizontal, 6)
      .background {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(isSelected ? Color.white : Color.black.opacity(0.35))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isLocked ? Color.orange.opacity(0.9) : Color.white.opacity(0.18), lineWidth: isLocked ? 2 : 1)
      }
    }
    .buttonStyle(.plain)
    .disabled(supported == false)
    .onLongPressGesture {
      guard supported, isSelected else { return }
      cameraPreferences.switchingMode = cameraPreferences.switchingMode == .auto ? .locked : .auto
      reconfigureCamera()
    }
  }

  private var zoomSection: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Zoom")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Spacer()
        Text(formatZoom(cameraService.currentZoom))
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
      }

      if cameraService.maxZoom > cameraService.minZoom + 0.01 {
        Slider(
          value: Binding(
            get: { cameraService.currentZoom },
            set: { newValue in
              updateZoom(newValue)
            }
          ),
          in: cameraService.minZoom...cameraService.maxZoom,
          step: 0.01
        )
      } else {
        Text("Zoom unavailable")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal)
  }

  private var guideSection: some View {
    HStack(spacing: 8) {
      guideChip("Grid", isOn: cameraPreferences.gridEnabled) {
        cameraPreferences.gridEnabled.toggle()
      }
      guideChip("1:1", isOn: cameraPreferences.squareGuideEnabled) {
        cameraPreferences.squareGuideEnabled.toggle()
      }
      guideChip("Horizon", isOn: cameraPreferences.horizonGuideEnabled) {
        cameraPreferences.horizonGuideEnabled.toggle()
      }
      Spacer()
      if cameraService.supportsFocusPoint || cameraService.supportsExposurePoint {
        Text("Tap to focus")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal)
  }

  private func guideChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.caption.weight(.semibold))
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background {
          Capsule(style: .continuous)
            .fill(isOn ? Color.white : Color.white.opacity(0.08))
        }
        .foregroundStyle(isOn ? .black : .primary)
        .overlay {
          Capsule(style: .continuous)
            .stroke(Color.white.opacity(0.14), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
  }

  private var actionBar: some View {
    HStack(spacing: 12) {
      Button("Undo") {
        appState.undoLastCapture()
      }
      .buttonStyle(.bordered)
      .disabled(appState.capturedPhotos.isEmpty)

      Button("Capture") {
        Task {
          do {
            let photo = try await cameraService.capturePhoto()
            appState.capturedPhotos.append(photo)
            appState.statusMessage = "Captured \(appState.capturedPhotos.count) photo(s)"
          } catch {
            appState.statusMessage = "Capture failed: \(error.localizedDescription)"
          }
        }
      }
      .buttonStyle(.borderedProminent)
      .disabled(cameraService.canCapture == false)

      Button("Next Item") {
        appState.advanceToNextItem()
      }
      .buttonStyle(.bordered)

      Button("Done", action: onDone)
        .buttonStyle(.bordered)
    }
    .padding(.horizontal)
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

  private func thumbnailPreview(_ image: UIImage) -> some View {
    Image(uiImage: image)
      .resizable()
      .scaledToFill()
      .frame(width: 56, height: 56)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .stroke(.white.opacity(0.5), lineWidth: 1)
      }
      .shadow(color: .black.opacity(0.25), radius: 4, x: 0, y: 2)
  }
}

private struct PreviewInteractionLayer: View {
  @ObservedObject var cameraService: CameraService
  @ObservedObject var cameraPreferences: CameraPreferencesStore
  @Binding var pinchStartZoom: Double?

  var body: some View {
    GeometryReader { proxy in
      Color.clear
        .contentShape(Rectangle())
        .gesture(singleTapGesture(in: proxy.size))
        .simultaneousGesture(doubleTapGesture)
        .simultaneousGesture(pinchGesture)
    }
  }

  private func singleTapGesture(in size: CGSize) -> some Gesture {
    SpatialTapGesture()
      .onEnded { value in
        let normalized = normalizedPoint(value.location, in: size)
        cameraService.focus(at: normalized)
      }
  }

  private var doubleTapGesture: some Gesture {
    TapGesture(count: 2)
      .onEnded {
        cameraService.resetFocus()
      }
  }

  private var pinchGesture: some Gesture {
    MagnificationGesture()
      .onChanged { scale in
        if pinchStartZoom == nil {
          pinchStartZoom = cameraService.currentZoom
        }
        if let base = pinchStartZoom {
          let target = base * scale
          let clamped = min(max(target, cameraService.minZoom), max(cameraService.maxZoom, cameraService.minZoom))
          cameraService.setZoom(clamped)
          cameraPreferences.setZoom(clamped, for: cameraPreferences.preferredLens)
        }
      }
      .onEnded { _ in
        pinchStartZoom = nil
      }
  }

  private func normalizedPoint(_ point: CGPoint, in size: CGSize) -> CGPoint {
    guard size.width > 0, size.height > 0 else {
      return CGPoint(x: 0.5, y: 0.5)
    }
    return CGPoint(
      x: min(max(point.x / size.width, 0), 1),
      y: min(max(point.y / size.height, 0), 1)
    )
  }
}

private struct CameraGuideOverlay: View {
  let gridEnabled: Bool
  let squareGuideEnabled: Bool
  let horizonGuideEnabled: Bool

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        if gridEnabled {
          Path { path in
            let w = proxy.size.width
            let h = proxy.size.height
            path.move(to: CGPoint(x: w / 3, y: 0))
            path.addLine(to: CGPoint(x: w / 3, y: h))
            path.move(to: CGPoint(x: 2 * w / 3, y: 0))
            path.addLine(to: CGPoint(x: 2 * w / 3, y: h))
            path.move(to: CGPoint(x: 0, y: h / 3))
            path.addLine(to: CGPoint(x: w, y: h / 3))
            path.move(to: CGPoint(x: 0, y: 2 * h / 3))
            path.addLine(to: CGPoint(x: w, y: 2 * h / 3))
          }
          .stroke(.white.opacity(0.18), lineWidth: 1)
        }

        if squareGuideEnabled {
          let side = min(proxy.size.width, proxy.size.height) * 0.8
          RoundedRectangle(cornerRadius: 12, style: .continuous)
            .stroke(.white.opacity(0.35), lineWidth: 1.5)
            .frame(width: side, height: side)
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
        }

        if horizonGuideEnabled {
          Path { path in
            path.move(to: CGPoint(x: 0, y: proxy.size.height / 2))
            path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height / 2))
          }
          .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [6, 6]))
          .foregroundStyle(.white.opacity(0.38))
        }
      }
      .allowsHitTesting(false)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
  }
}

private struct FocusIndicatorView: View {
  let indicator: FocusIndicator

  var body: some View {
    let color: Color = indicator.isSuccessful ? .white : .red

    Group {
      if indicator.isSuccessful {
        Circle()
          .stroke(color.opacity(0.95), lineWidth: 2)
          .frame(width: 42, height: 42)
      } else {
        Image(systemName: "xmark.circle.fill")
          .font(.system(size: 32, weight: .bold))
          .foregroundStyle(color.opacity(0.95))
      }
    }
    .shadow(color: .black.opacity(0.35), radius: 4, x: 0, y: 2)
  }
}

private extension String {
  var nonEmpty: String? {
    isEmpty ? nil : self
  }
}
