import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewView: UIViewRepresentable {
  let session: AVCaptureSession

  func makeUIView(context: Context) -> PreviewUIView {
    let view = PreviewUIView()
    view.videoPreviewLayer.session = session
    view.videoPreviewLayer.videoGravity = .resizeAspectFill
    return view
  }

  func updateUIView(_ uiView: PreviewUIView, context: Context) {
    if uiView.videoPreviewLayer.session !== session {
      uiView.videoPreviewLayer.session = session
    }
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

  override func layoutSubviews() {
    super.layoutSubviews()
    applyPortraitPreviewRotation()
  }

  /// Locks the live preview to portrait even when the device is physically rotated.
  func applyPortraitPreviewRotation() {
    guard let connection = videoPreviewLayer.connection else { return }
    let angle = portraitPreviewRotationAngle()
    guard connection.isVideoRotationAngleSupported(angle) else { return }
    connection.videoRotationAngle = angle
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
