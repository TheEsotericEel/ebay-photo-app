import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewView: UIViewRepresentable {
  let session: AVCaptureSession
  var currentZoom: Double
  var minZoom: Double
  var maxZoom: Double
  var onTapFocus: ((CGPoint, CGPoint) -> Void)? = nil
  var onResetFocus: ((CGPoint) -> Void)? = nil
  var onZoomChange: ((Double) -> Void)? = nil

  func makeUIView(context: Context) -> PreviewUIView {
    let view = PreviewUIView()
    view.videoPreviewLayer.session = session
    view.videoPreviewLayer.videoGravity = .resizeAspectFill
    view.updateInteractionHandlers(
      currentZoom: currentZoom,
      minZoom: minZoom,
      maxZoom: maxZoom,
      onTapFocus: onTapFocus,
      onResetFocus: onResetFocus,
      onZoomChange: onZoomChange
    )
    return view
  }

  func updateUIView(_ uiView: PreviewUIView, context: Context) {
    if uiView.videoPreviewLayer.session !== session {
      uiView.videoPreviewLayer.session = session
    }
    uiView.updateInteractionHandlers(
      currentZoom: currentZoom,
      minZoom: minZoom,
      maxZoom: maxZoom,
      onTapFocus: onTapFocus,
      onResetFocus: onResetFocus,
      onZoomChange: onZoomChange
    )
    uiView.applyPortraitPreviewRotation()
  }
}

final class PreviewUIView: UIView {
  override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  var videoPreviewLayer: AVCaptureVideoPreviewLayer {
    layer as! AVCaptureVideoPreviewLayer
  }

  private var currentZoom: Double = 1
  private var minZoom: Double = 1
  private var maxZoom: Double = 1
  private var onTapFocus: ((CGPoint, CGPoint) -> Void)?
  private var onResetFocus: ((CGPoint) -> Void)?
  private var onZoomChange: ((Double) -> Void)?
  private var pinchStartZoom: Double?

  private lazy var singleTapRecognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
    recognizer.numberOfTapsRequired = 1
    recognizer.numberOfTouchesRequired = 1
    return recognizer
  }()

  private lazy var doubleTapRecognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
    recognizer.numberOfTapsRequired = 2
    recognizer.numberOfTouchesRequired = 1
    return recognizer
  }()

  private lazy var pinchRecognizer: UIPinchGestureRecognizer = {
    let recognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
    return recognizer
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupGestureRecognizers()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    applyPortraitPreviewRotation()
  }

  func updateInteractionHandlers(
    currentZoom: Double,
    minZoom: Double,
    maxZoom: Double,
    onTapFocus: ((CGPoint, CGPoint) -> Void)?,
    onResetFocus: ((CGPoint) -> Void)?,
    onZoomChange: ((Double) -> Void)?
  ) {
    self.currentZoom = currentZoom
    self.minZoom = minZoom
    self.maxZoom = maxZoom
    self.onTapFocus = onTapFocus
    self.onResetFocus = onResetFocus
    self.onZoomChange = onZoomChange
  }

  /// Locks the live preview to portrait even when the device is physically rotated.
  func applyPortraitPreviewRotation() {
    guard let connection = videoPreviewLayer.connection else { return }
    let angle = portraitPreviewRotationAngle()
    guard connection.isVideoRotationAngleSupported(angle) else { return }
    connection.videoRotationAngle = angle
  }

  private func setupGestureRecognizers() {
    singleTapRecognizer.require(toFail: doubleTapRecognizer)
    addGestureRecognizer(singleTapRecognizer)
    addGestureRecognizer(doubleTapRecognizer)
    addGestureRecognizer(pinchRecognizer)
  }

  @objc
  private func handleSingleTap(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended else { return }
    let layerPoint = recognizer.location(in: self)
    let devicePoint = videoPreviewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)
    onTapFocus?(layerPoint, devicePoint)
  }

  @objc
  private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended else { return }
    let layerPoint = recognizer.location(in: self)
    onResetFocus?(layerPoint)
  }

  @objc
  private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    switch recognizer.state {
    case .began:
      pinchStartZoom = currentZoom
    case .changed:
      guard let base = pinchStartZoom else { return }
      let target = base * Double(recognizer.scale)
      let clamped = min(max(target, minZoom), maxZoom)
      onZoomChange?(clamped)
    case .ended, .cancelled, .failed:
      pinchStartZoom = nil
    default:
      break
    }
  }

  private func portraitPreviewRotationAngle() -> CGFloat {
    switch window?.windowScene?.interfaceOrientation {
    case .portraitUpsideDown:
      return 270
    default:
      return 90
    }
  }
}
