import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewArea: View {
  let session: AVCaptureSession
  @ObservedObject var cameraService: CameraService
  @ObservedObject var cameraPreferences: CameraPreferencesStore
  let canUndo: Bool
  let onUndo: () -> Void
  let onSelectLens: (CameraLensPreset) -> Void
  let onSelectAuto: () -> Void
  private let cornerRadius: CGFloat = 22

  var body: some View {
    GeometryReader { geo in
      let squareSide = max(min(geo.size.width, geo.size.height), 120)
      squarePreview(side: squareSide)
        .frame(width: squareSide, height: squareSide)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
  }

  @ViewBuilder
  private func squarePreview(side: CGFloat) -> some View {
      CameraPreviewView(
        session: session,
        currentZoom: cameraService.currentZoom,
        minZoom: cameraService.minZoom,
        maxZoom: cameraService.userFacingMaxZoom,
      onTapFocus: { previewPoint, devicePoint in
        cameraService.focus(at: devicePoint, displayPoint: previewPoint)
        CameraFeedback.selection()
      },
      onResetFocus: { previewPoint in
        cameraService.resetFocus(displayPoint: previewPoint)
        CameraFeedback.selection()
      },
      onZoomChange: { zoom in
        let lens = cameraPreferences.preferredLens
        let clamped = min(max(zoom, cameraService.minZoom), max(cameraService.userFacingMaxZoom, cameraService.minZoom))
        cameraPreferences.setZoom(clamped, for: lens)
        cameraService.setZoom(clamped)
      }
    )
      .frame(width: side, height: side)
      .background(.black)
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .shadow(color: .black.opacity(0.34), radius: 20, x: 0, y: 12)
      .overlay {
        if cameraPreferences.gridEnabled || cameraPreferences.horizonGuideEnabled {
          CameraGuideOverlay(
            gridEnabled: cameraPreferences.gridEnabled,
            horizonGuideEnabled: cameraPreferences.horizonGuideEnabled,
            cornerRadius: cornerRadius
          )
        }
      }
      .overlay {
        if let indicator = cameraService.focusIndicator {
          FocusIndicatorView(indicator: indicator)
            .position(indicator.displayPoint)
        }
      }
      .overlay(alignment: .topLeading) {
        if canUndo {
          cameraOverlayButton(systemName: "arrow.uturn.backward", action: onUndo)
            .padding(12)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        LensChipRow(
          preferredLens: cameraPreferences.preferredLens,
          switchingMode: cameraPreferences.switchingMode,
          supportedLenses: cameraService.supportedLenses,
          onSelectLens: onSelectLens,
          onSelectAuto: onSelectAuto
        )
        .padding(12)
      }
  }

  private func cameraOverlayButton(
    systemName: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemName)
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 38, height: 38)
        .background {
          Circle()
            .fill(.black.opacity(0.56))
        }
        .overlay {
          Circle()
            .stroke(.white.opacity(0.14), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.35), radius: 6, x: 0, y: 3)
    }
    .buttonStyle(PressFeedbackButtonStyle())
    .accessibilityLabel("Undo last capture")
  }
}

private struct CameraGuideOverlay: View {
  let gridEnabled: Bool
  let horizonGuideEnabled: Bool
  let cornerRadius: CGFloat

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
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
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
