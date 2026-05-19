@preconcurrency import AVFoundation
import Combine
import Foundation
import UIKit

enum CameraLensPreset: String, CaseIterable, Identifiable, Codable {
  case ultraWide = ".5"
  case wide = "1x"

  var id: String { rawValue }
}

enum LensSwitchingMode: String, Codable {
  case auto
  case locked
}

enum PreviewAspectMode: String, Codable {
  case square
  case native
}

struct CameraLensState: Codable, Equatable {
  var preferredLens: CameraLensPreset
  var switchingMode: LensSwitchingMode
}

struct CameraCapabilityProbe: Equatable {
  var availableLogicalModes: [CameraLensPreset]
  var availablePhysicalDevices: [String]
  var availableVirtualDevices: [String]
  var selectedDeviceType: String
  var activeDeviceId: String
  var preferredLens: CameraLensPreset
  var switchingMode: LensSwitchingMode
  var minZoom: Double
  var maxZoom: Double
  var currentZoom: Double
  var supportsFocusPoint: Bool
  var supportsExposurePoint: Bool
  var fallbackReason: String?
}

struct FocusIndicator: Equatable {
  var normalizedPoint: CGPoint
  var isSuccessful: Bool
  var timestamp: Date
}

private struct PersistedCameraPreferences: Codable {
  var preferredLensRawValue: String
  var switchingModeRawValue: String
  var zoomByLens: [String: Double]
  var gridEnabled: Bool
  var horizonGuideEnabled: Bool
  var aspectModeRawValue: String?
  var squareGuideEnabled: Bool?
}

@MainActor
final class CameraPreferencesStore: ObservableObject {
  @Published var preferredLens: CameraLensPreset {
    didSet { save() }
  }

  @Published var switchingMode: LensSwitchingMode {
    didSet { save() }
  }

  @Published var zoomByLens: [String: Double] {
    didSet { save() }
  }

  @Published var gridEnabled: Bool {
    didSet { save() }
  }

  @Published var horizonGuideEnabled: Bool {
    didSet { save() }
  }

  @Published var aspectMode: PreviewAspectMode {
    didSet { save() }
  }

  private let defaults: UserDefaults
  private let storageKey = "ebp.camera.preferences.v1"

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults

    if let loaded = Self.load(from: defaults) {
      preferredLens = loaded.preferredLens
      switchingMode = loaded.switchingMode
      zoomByLens = loaded.zoomByLens
      gridEnabled = loaded.gridEnabled
      horizonGuideEnabled = loaded.horizonGuideEnabled
      aspectMode = loaded.aspectMode
    } else {
      preferredLens = .wide
      switchingMode = .auto
      zoomByLens = [
        CameraLensPreset.ultraWide.rawValue: 0.5,
        CameraLensPreset.wide.rawValue: 1.0,
      ]
      gridEnabled = false
      horizonGuideEnabled = false
      aspectMode = .square
    }
  }

  func zoom(for lens: CameraLensPreset) -> Double {
    let value = zoomByLens[lens.rawValue]
    let fallback = lens == .ultraWide ? 0.5 : 1.0
    return max(value ?? fallback, 0.1)
  }

  func setZoom(_ zoom: Double, for lens: CameraLensPreset) {
    zoomByLens[lens.rawValue] = max(0.1, zoom)
  }

  func normalizedLensState() -> CameraLensState {
    CameraLensState(preferredLens: preferredLens, switchingMode: switchingMode)
  }

  private func save() {
    let payload = PersistedCameraPreferences(
      preferredLensRawValue: preferredLens.rawValue,
      switchingModeRawValue: switchingMode.rawValue,
      zoomByLens: zoomByLens,
      gridEnabled: gridEnabled,
      horizonGuideEnabled: horizonGuideEnabled,
      aspectModeRawValue: aspectMode.rawValue,
      squareGuideEnabled: nil
    )
    if let data = try? JSONEncoder().encode(payload) {
      defaults.set(data, forKey: storageKey)
    }
  }

  private static func load(from defaults: UserDefaults) -> CameraPreferencesSnapshot? {
    guard let data = defaults.data(forKey: "ebp.camera.preferences.v1"),
          let payload = try? JSONDecoder().decode(PersistedCameraPreferences.self, from: data),
          let lens = CameraLensPreset(rawValue: payload.preferredLensRawValue),
          let mode = LensSwitchingMode(rawValue: payload.switchingModeRawValue)
    else {
      return nil
    }

    let aspectMode = payload.aspectModeRawValue
      .flatMap(PreviewAspectMode.init(rawValue:))
      ?? .square

    return CameraPreferencesSnapshot(
      preferredLens: lens,
      switchingMode: mode,
      zoomByLens: payload.zoomByLens,
      gridEnabled: payload.gridEnabled,
      horizonGuideEnabled: payload.horizonGuideEnabled,
      aspectMode: aspectMode
    )
  }
}

private struct CameraPreferencesSnapshot {
  let preferredLens: CameraLensPreset
  let switchingMode: LensSwitchingMode
  let zoomByLens: [String: Double]
  let gridEnabled: Bool
  let horizonGuideEnabled: Bool
  let aspectMode: PreviewAspectMode
}

@MainActor
final class CameraService: NSObject, ObservableObject {
  let session = AVCaptureSession()

  @Published private(set) var availableLenses: [CameraLensPreset] = [.ultraWide, .wide]
  @Published private(set) var supportedLenses: Set<CameraLensPreset> = []
  @Published private(set) var activeLensState = CameraLensState(preferredLens: .wide, switchingMode: .auto)
  @Published private(set) var activeDeviceLabel = "Rear Camera"
  @Published private(set) var currentZoom: Double = 1
  @Published private(set) var minZoom: Double = 1
  @Published private(set) var maxZoom: Double = 1
  @Published private(set) var supportsFocusPoint = false
  @Published private(set) var supportsExposurePoint = false
  @Published private(set) var focusIndicator: FocusIndicator?
  @Published private(set) var canCapture = false
  @Published private(set) var isRunning = false
  @Published private(set) var isConfigured = false
  @Published private(set) var capabilityProbe = CameraCapabilityProbe(
    availableLogicalModes: [.ultraWide, .wide],
    availablePhysicalDevices: [],
    availableVirtualDevices: [],
    selectedDeviceType: "none",
    activeDeviceId: "none",
    preferredLens: .wide,
    switchingMode: .auto,
    minZoom: 1,
    maxZoom: 1,
    currentZoom: 1,
    supportsFocusPoint: false,
    supportsExposurePoint: false,
    fallbackReason: nil
  )
  @Published private(set) var debugSummary = "Camera not started."

  private let sessionQueue = DispatchQueue(label: "com.joesprojects.ebayphoto.camera.session")
  private var activeDevice: AVCaptureDevice?
  private var activeDeviceInput: AVCaptureDeviceInput?
  private var photoOutput = AVCapturePhotoOutput()
  private var preferredPhotoDimensions: CMVideoDimensions?
  private var captureDelegate: PhotoCaptureDelegate?
  private var captureContinuation: CheckedContinuation<CapturedPhoto, Error>?
  private var captureCooldownWorkItem: DispatchWorkItem?
  private var focusIndicatorWorkItem: DispatchWorkItem?

  private struct SessionResult {
    let activeLensState: CameraLensState
    let activeDeviceLabel: String
    let currentZoom: Double
    let minZoom: Double
    let maxZoom: Double
    let supportsFocusPoint: Bool
    let supportsExposurePoint: Bool
    let probe: CameraCapabilityProbe
    let fallbackReason: String?
    let isConfigured: Bool
    let debugSummary: String
    let canCapture: Bool
    let supportedLenses: Set<CameraLensPreset>
  }

  override init() {
    super.init()
  }

  func start(lensState: CameraLensState, zoom: Double) {
    requestCameraAccess { [weak self] granted in
      guard let self else { return }
      guard granted else {
        self.applyPermissionDeniedState()
        return
      }

      let result = self.sessionQueue.sync {
        self.configureSession(lensState: lensState, zoom: zoom)
      }
      self.apply(result)
      if result.isConfigured {
        self.sessionQueue.sync {
          if !self.session.isRunning {
            self.session.startRunning()
          }
        }
        self.isRunning = true
        self.canCapture = true
      }
    }
  }

  func stop() {
    sessionQueue.sync {
      captureDelegate = nil
      captureContinuation = nil
      captureCooldownWorkItem?.cancel()
      captureCooldownWorkItem = nil
      focusIndicatorWorkItem?.cancel()
      focusIndicatorWorkItem = nil
      if session.isRunning {
        session.stopRunning()
      }
    }
    isRunning = false
    canCapture = false
  }

  func applyLensState(_ lensState: CameraLensState, zoom: Double) {
    let result = sessionQueue.sync {
      configureSession(lensState: lensState, zoom: zoom)
    }
    apply(result)
  }

  func setZoom(_ zoom: Double) {
    guard let device = activeDevice else { return }
    let clamped = clampZoom(zoom, device: device)
    currentZoom = clamped
    capabilityProbe.currentZoom = clamped

    sessionQueue.sync {
      do {
        try device.lockForConfiguration()
        device.videoZoomFactor = CGFloat(clamped)
        device.unlockForConfiguration()
      } catch {
        Task { @MainActor in
          self.debugSummary = "Zoom failed: \(error.localizedDescription)"
          self.capabilityProbe.fallbackReason = "Zoom failed: \(error.localizedDescription)"
        }
      }
    }
  }

  func focus(at normalizedPoint: CGPoint) {
    guard let device = activeDevice else { return }
    let success = applyFocusPoint(to: device, normalizedPoint: normalizedPoint)
    publishFocusIndicator(normalizedPoint: normalizedPoint, isSuccessful: success)
  }

  func resetFocus() {
    guard let device = activeDevice else { return }
    let success = resetContinuousFocus(on: device)
    publishFocusIndicator(
      normalizedPoint: CGPoint(x: 0.5, y: 0.5),
      isSuccessful: success
    )
  }

  func capturePhoto(aspectMode: PreviewAspectMode) async throws -> CapturedPhoto {
    guard canCapture, !captureInFlight else {
      throw NSError(domain: "CameraService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Capture is already in progress."])
    }
    guard isConfigured, activeDevice != nil else {
      throw NSError(domain: "CameraService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Camera is not ready yet."])
    }

    captureInFlight = true
    canCapture = false
    captureCooldownWorkItem?.cancel()

    return try await withCheckedThrowingContinuation { continuation in
      captureContinuation = continuation
      let settings = AVCapturePhotoSettings()
      if let preferredPhotoDimensions, photoOutput.connection(with: .video) != nil {
        settings.maxPhotoDimensions = preferredPhotoDimensions
      } else if preferredPhotoDimensions != nil {
        print("Skipping capture maxPhotoDimensions: photo output is not connected to a video source.")
      }
      settings.photoQualityPrioritization = .quality

      let delegate = PhotoCaptureDelegate { [weak self] result in
        guard let self else { return }
        Task { @MainActor in
          self.captureInFlight = false
          self.captureDelegate = nil
          switch result {
          case .success(let data):
            let deliverableData: Data
            switch aspectMode {
            case .square:
              deliverableData = PhotoFraming.squareDeliverableJPEG(from: data) ?? data
            case .native:
              deliverableData = data
            }

            let preview = UIImage(data: deliverableData)?.ebp_thumbnailData()
            let capturedPhoto = CapturedPhoto(
              data: deliverableData,
              thumbnailData: preview,
              lensLabel: self.activeLensState.preferredLens.rawValue,
              capturedAt: .now
            )
            self.captureContinuation?.resume(returning: capturedPhoto)
            self.captureContinuation = nil
            self.scheduleCaptureCooldown()
          case .failure(let error):
            self.captureContinuation?.resume(throwing: error)
            self.captureContinuation = nil
            self.scheduleCaptureCooldown()
          }
        }
      }

      captureDelegate = delegate
      photoOutput.capturePhoto(with: settings, delegate: delegate)
    }
  }

  private var captureInFlight = false

  private func scheduleCaptureCooldown() {
    captureCooldownWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      Task { @MainActor in
        self?.canCapture = true
      }
    }
    captureCooldownWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: workItem)
  }

  private func publishFocusIndicator(normalizedPoint: CGPoint, isSuccessful: Bool) {
    focusIndicatorWorkItem?.cancel()
    focusIndicator = FocusIndicator(normalizedPoint: normalizedPoint, isSuccessful: isSuccessful, timestamp: .now)

    let workItem = DispatchWorkItem { [weak self] in
      Task { @MainActor in
        self?.focusIndicator = nil
      }
    }
    focusIndicatorWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: workItem)
  }

  private func requestCameraAccess(completion: @escaping (Bool) -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      completion(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          completion(granted)
        }
      }
    default:
      completion(false)
    }
  }

  private func applyPermissionDeniedState() {
    isConfigured = false
    isRunning = false
    canCapture = false
    debugSummary = "Camera permission is denied."
    capabilityProbe.fallbackReason = "Camera permission is denied."
  }

  private func apply(_ result: SessionResult) {
    activeLensState = result.activeLensState
    activeDeviceLabel = result.activeDeviceLabel
    currentZoom = result.currentZoom
    minZoom = result.minZoom
    maxZoom = result.maxZoom
    supportsFocusPoint = result.supportsFocusPoint
    supportsExposurePoint = result.supportsExposurePoint
    capabilityProbe = result.probe
    isConfigured = result.isConfigured
    debugSummary = result.debugSummary
    canCapture = result.canCapture
    supportedLenses = result.supportedLenses
    if let reason = result.fallbackReason {
      capabilityProbe.fallbackReason = reason
      debugSummary = result.debugSummary + " | \(reason)"
    }
  }

  private func configureSession(lensState: CameraLensState, zoom: Double) -> SessionResult {
    session.beginConfiguration()

    session.sessionPreset = .photo

    let catalog = discoverDeviceCatalog()
    let selectedDeviceResult = selectDevice(for: lensState, catalog: catalog)
    let selectedDevice = selectedDeviceResult.device
    let fallbackReason = selectedDeviceResult.fallbackReason

    if let currentInput = activeDeviceInput {
      session.removeInput(currentInput)
      activeDeviceInput = nil
    }

    if let selectedDevice {
      do {
        let input = try AVCaptureDeviceInput(device: selectedDevice)
        if session.canAddInput(input) {
          session.addInput(input)
          activeDeviceInput = input
          activeDevice = selectedDevice
        }
      } catch {
        session.commitConfiguration()
        return makeFallbackResult(
          lensState: lensState,
          catalog: catalog,
          fallbackReason: "Device input failed: \(error.localizedDescription)"
        )
      }
    } else {
      session.commitConfiguration()
      return makeFallbackResult(
        lensState: lensState,
        catalog: catalog,
        fallbackReason: fallbackReason ?? "No rear camera matched the requested lens."
      )
    }

    guard let activeDevice else {
      session.commitConfiguration()
      return makeFallbackResult(
        lensState: lensState,
        catalog: catalog,
        fallbackReason: fallbackReason ?? "Unable to activate a rear camera device."
      )
    }

    // In AUTO mode with a virtual/composite device, default to the wide-angle
    // perspective (user-facing "1x"). virtualDeviceSwitchOverVideoZoomFactors
    // gives the exact factor where the composite switches from ultrawide → wide.
    // For locked modes use the persisted per-lens zoom value unchanged.
    let effectiveZoom: Double
    if lensState.switchingMode == .auto,
       !activeDevice.constituentDevices.isEmpty {
      effectiveZoom = wideEquivalentZoom(for: activeDevice)
    } else {
      effectiveZoom = zoom
    }
    let chosenZoom = clampZoom(effectiveZoom, device: activeDevice)
    applyZoom(chosenZoom, to: activeDevice)

    let supportsFocus = activeDevice.isFocusPointOfInterestSupported
    let supportsExposure = activeDevice.isExposurePointOfInterestSupported
    let probe = makeProbe(
      catalog: catalog,
      device: activeDevice,
      lensState: lensState,
      zoom: chosenZoom,
      supportsFocus: supportsFocus,
      supportsExposure: supportsExposure,
      fallbackReason: fallbackReason
    )

    if session.outputs.contains(where: { $0 === photoOutput }) == false, session.canAddOutput(photoOutput) {
      session.addOutput(photoOutput)
    }

    session.commitConfiguration()

    applyPreferredPhotoDimensions(for: activeDevice)

    let summary = [
      "Lens \(lensState.preferredLens.rawValue) \(lensState.switchingMode.rawValue)",
      "device=\(activeDevice.localizedName)",
      "zoom=\(String(format: "%.2f", chosenZoom))",
      "range=\(String(format: "%.2f", activeDevice.minAvailableVideoZoomFactor))-\(String(format: "%.2f", activeDevice.maxAvailableVideoZoomFactor))",
    ].joined(separator: " | ")

    return SessionResult(
      activeLensState: lensState,
      activeDeviceLabel: activeDevice.localizedName,
      currentZoom: chosenZoom,
      minZoom: Double(activeDevice.minAvailableVideoZoomFactor),
      maxZoom: Double(activeDevice.maxAvailableVideoZoomFactor),
      supportsFocusPoint: supportsFocus,
      supportsExposurePoint: supportsExposure,
      probe: probe,
      fallbackReason: fallbackReason,
      isConfigured: true,
      debugSummary: summary,
      canCapture: true,
      supportedLenses: supportedLenses(from: catalog)
    )
  }

  private func makeFallbackResult(
    lensState: CameraLensState,
    catalog: DeviceCatalog,
    fallbackReason: String
  ) -> SessionResult {
    let supported = supportedLenses(from: catalog)
    let probe = CameraCapabilityProbe(
      availableLogicalModes: Array(supported.isEmpty ? [.ultraWide, .wide] : supported).sorted { $0.rawValue < $1.rawValue },
      availablePhysicalDevices: catalog.physicalDevices.map(\.localizedName),
      availableVirtualDevices: catalog.virtualDevices.map(\.localizedName),
      selectedDeviceType: "none",
      activeDeviceId: "none",
      preferredLens: lensState.preferredLens,
      switchingMode: lensState.switchingMode,
      minZoom: 1,
      maxZoom: 1,
      currentZoom: 1,
      supportsFocusPoint: false,
      supportsExposurePoint: false,
      fallbackReason: fallbackReason
    )

    return SessionResult(
      activeLensState: lensState,
      activeDeviceLabel: "Rear Camera",
      currentZoom: 1,
      minZoom: 1,
      maxZoom: 1,
      supportsFocusPoint: false,
      supportsExposurePoint: false,
      probe: probe,
      fallbackReason: fallbackReason,
      isConfigured: false,
      debugSummary: "Camera fallback: \(fallbackReason)",
      canCapture: false,
      supportedLenses: supported
    )
  }

  private func applyZoom(_ zoom: Double, to device: AVCaptureDevice) {
    do {
      try device.lockForConfiguration()
      device.videoZoomFactor = CGFloat(clampZoom(zoom, device: device))
      device.unlockForConfiguration()
    } catch {
      debugSummary = "Zoom failed: \(error.localizedDescription)"
    }
  }

  private func clampZoom(_ zoom: Double, device: AVCaptureDevice) -> Double {
    let minimum = Double(device.minAvailableVideoZoomFactor)
    let maximum = Double(device.maxAvailableVideoZoomFactor)
    return min(max(zoom, minimum), maximum)
  }

  /// Returns the zoom factor on a virtual/composite device that corresponds to
  /// the wide-angle camera perspective (the user-facing "1x" default).
  /// Uses `virtualDeviceSwitchOverVideoZoomFactors.first` — the exact factor
  /// at which the composite switches from ultrawide → wide physical camera.
  /// Falls back to 2.0, which is correct on virtually all current iPhones.
  private func wideEquivalentZoom(for device: AVCaptureDevice) -> Double {
    if let switchOver = device.virtualDeviceSwitchOverVideoZoomFactors.first {
      return Double(switchOver)
    }
    return 2.0
  }

  private func preferredMaxPhotoDimensions(for device: AVCaptureDevice?) -> CMVideoDimensions? {
    guard let device else { return nil }
    guard #available(iOS 16.0, *) else { return nil }
    let candidates = device.activeFormat.supportedMaxPhotoDimensions
    return candidates.max { lhs, rhs in
      let lhsPixels = Int64(lhs.width) * Int64(lhs.height)
      let rhsPixels = Int64(rhs.width) * Int64(rhs.height)
      return lhsPixels < rhsPixels
    }
  }

  private func applyPreferredPhotoDimensions(for device: AVCaptureDevice?) {
    guard let device else {
      preferredPhotoDimensions = nil
      print("Skipping maxPhotoDimensions: no active device is available.")
      return
    }
    guard photoOutput.connection(with: .video) != nil else {
      preferredPhotoDimensions = nil
      print("Skipping maxPhotoDimensions: photo output is not connected to a video source.")
      return
    }

    guard let dimensions = preferredMaxPhotoDimensions(for: device) else {
      preferredPhotoDimensions = nil
      print("Skipping maxPhotoDimensions: no supported photo dimensions were reported by the active camera format.")
      return
    }

    preferredPhotoDimensions = dimensions
    photoOutput.maxPhotoDimensions = dimensions
  }

  private func applyFocusPoint(to device: AVCaptureDevice, normalizedPoint: CGPoint) -> Bool {
    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      let devicePoint = CGPoint(x: normalizedPoint.x, y: normalizedPoint.y)
      var success = false

      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = devicePoint
        if device.isFocusModeSupported(.autoFocus) {
          device.focusMode = .autoFocus
        } else if device.isFocusModeSupported(.continuousAutoFocus) {
          device.focusMode = .continuousAutoFocus
        }
        success = true
      }

      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = devicePoint
        if device.isExposureModeSupported(.autoExpose) {
          device.exposureMode = .autoExpose
        } else if device.isExposureModeSupported(.continuousAutoExposure) {
          device.exposureMode = .continuousAutoExposure
        }
        success = true || success
      }

      return success
    } catch {
      debugSummary = "Focus failed: \(error.localizedDescription)"
      return false
    }
  }

  private func resetContinuousFocus(on device: AVCaptureDevice) -> Bool {
    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      var success = false
      if device.isFocusModeSupported(.continuousAutoFocus) {
        device.focusMode = .continuousAutoFocus
        success = true
      }
      if device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
        success = true || success
      }
      return success
    } catch {
      debugSummary = "Focus reset failed: \(error.localizedDescription)"
      return false
    }
  }

  private func discoverDeviceCatalog() -> DeviceCatalog {
    let physicalTypes: [AVCaptureDevice.DeviceType] = [
      .builtInUltraWideCamera,
      .builtInWideAngleCamera,
    ]
    let virtualTypes: [AVCaptureDevice.DeviceType] = [
      .builtInDualWideCamera,
      .builtInDualCamera,
    ]

    let physicalDiscovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: physicalTypes,
      mediaType: .video,
      position: .back
    )
    let virtualDiscovery = AVCaptureDevice.DiscoverySession(
      deviceTypes: virtualTypes,
      mediaType: .video,
      position: .back
    )

    return DeviceCatalog(
      physicalDevices: physicalDiscovery.devices,
      virtualDevices: virtualDiscovery.devices
    )
  }

  private func supportedLenses(from catalog: DeviceCatalog) -> Set<CameraLensPreset> {
    var lenses: Set<CameraLensPreset> = []
    if catalog.physicalDevices.contains(where: { $0.deviceType == .builtInUltraWideCamera }) || catalog.virtualDevices.isEmpty == false {
      lenses.insert(.ultraWide)
    }
    if catalog.physicalDevices.contains(where: { $0.deviceType == .builtInWideAngleCamera }) || catalog.virtualDevices.isEmpty == false {
      lenses.insert(.wide)
    }
    if lenses.isEmpty {
      lenses = [.ultraWide, .wide]
    }
    return lenses
  }

  private func selectDevice(
    for lensState: CameraLensState,
    catalog: DeviceCatalog
  ) -> (device: AVCaptureDevice?, fallbackReason: String?) {
    let physicalUltraWide = catalog.physicalDevices.first(where: { $0.deviceType == .builtInUltraWideCamera })
    let physicalWide = catalog.physicalDevices.first(where: { $0.deviceType == .builtInWideAngleCamera })
    let compositeDualWide = catalog.virtualDevices.first(where: { $0.deviceType == .builtInDualWideCamera })
    let compositeDual = catalog.virtualDevices.first(where: { $0.deviceType == .builtInDualCamera })

    switch lensState.switchingMode {
    case .auto:
      if let compositeDualWide {
        return (compositeDualWide, nil)
      }
      if lensState.preferredLens == .ultraWide, let physicalUltraWide {
        return (physicalUltraWide, "Auto mode fell back to physical ultra-wide camera.")
      }
      if lensState.preferredLens == .wide, let physicalWide {
        return (physicalWide, "Auto mode fell back to physical wide camera.")
      }
      if let physicalWide {
        return (physicalWide, "Auto mode fell back to wide camera.")
      }
      if let physicalUltraWide {
        return (physicalUltraWide, "Auto mode fell back to ultra-wide camera.")
      }
      if let compositeDual {
        return (compositeDual, "Auto mode fell back to dual camera.")
      }
      return (nil, "No usable rear camera device found.")

    case .locked:
      if lensState.preferredLens == .ultraWide, let physicalUltraWide {
        return (physicalUltraWide, nil)
      }
      if lensState.preferredLens == .wide, let physicalWide {
        return (physicalWide, nil)
      }
      if let compositeDualWide {
        return (compositeDualWide, "Locked mode fell back to dual-wide virtual camera.")
      }
      if let compositeDual {
        return (compositeDual, "Locked mode fell back to dual virtual camera.")
      }
      if let physicalWide {
        return (physicalWide, "Locked mode fell back to wide camera.")
      }
      if let physicalUltraWide {
        return (physicalUltraWide, "Locked mode fell back to ultra-wide camera.")
      }
      return (nil, "No usable rear camera device found.")
    }
  }

  private func makeProbe(
    catalog: DeviceCatalog,
    device: AVCaptureDevice,
    lensState: CameraLensState,
    zoom: Double,
    supportsFocus: Bool,
    supportsExposure: Bool,
    fallbackReason: String?
  ) -> CameraCapabilityProbe {
    CameraCapabilityProbe(
      availableLogicalModes: Array(supportedLenses(from: catalog)).sorted { $0.rawValue < $1.rawValue },
      availablePhysicalDevices: catalog.physicalDevices.map(\.localizedName),
      availableVirtualDevices: catalog.virtualDevices.map(\.localizedName),
      selectedDeviceType: String(describing: device.deviceType),
      activeDeviceId: device.uniqueID,
      preferredLens: lensState.preferredLens,
      switchingMode: lensState.switchingMode,
      minZoom: Double(device.minAvailableVideoZoomFactor),
      maxZoom: Double(device.maxAvailableVideoZoomFactor),
      currentZoom: zoom,
      supportsFocusPoint: supportsFocus,
      supportsExposurePoint: supportsExposure,
      fallbackReason: fallbackReason
    )
  }
}

private struct DeviceCatalog {
  let physicalDevices: [AVCaptureDevice]
  let virtualDevices: [AVCaptureDevice]
}

private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private var completion: ((Result<Data, Error>) -> Void)?
  private var didComplete = false

  init(completion: @escaping (Result<Data, Error>) -> Void) {
    self.completion = completion
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    guard didComplete == false else { return }
    if let error {
      didComplete = true
      completion?(.failure(error))
      completion = nil
      return
    }

    guard let data = photo.fileDataRepresentation() else {
      return
    }

    didComplete = true
    completion?(.success(data))
    completion = nil
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    guard didComplete == false else { return }
    didComplete = true
    if let error {
      completion?(.failure(error))
    } else {
      completion?(.failure(NSError(
        domain: "CameraService",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey: "Capture finished without photo data."]
      )))
    }
    completion = nil
  }
}
