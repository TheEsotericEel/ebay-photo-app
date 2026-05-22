import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewArea: View {
  let session: AVCaptureSession
  @ObservedObject var cameraService: CameraService
  @ObservedObject var cameraPreferences: CameraPreferencesStore
  @Binding var pinchStartZoom: Double?
  let canUndo: Bool
  let onUndo: () -> Void
  let onSelectLens: (CameraLensPreset) -> Void
  let onSelectAuto: () -> Void
  private let cornerRadius: CGFloat = 28

  var body: some View {
    GeometryReader { geo in
      let squareSide = max(min(geo.size.width, geo.size.height), 120)
      squarePreview(side: squareSide)
        .frame(maxWidth: .infinity, alignment: .center)
    }
  }

  @ViewBuilder
  private func squarePreview(side: CGFloat) -> some View {
    CameraPreviewView(session: session)
      .frame(width: side, height: side)
      .background(.black)
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .shadow(color: .black.opacity(0.34), radius: 20, x: 0, y: 12)
      .overlay {
        PreviewInteractionLayer(
          cameraService: cameraService,
          cameraPreferences: cameraPreferences,
          pinchStartZoom: $pinchStartZoom
        )
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      }
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
        GeometryReader { proxy in
          if let indicator = cameraService.focusIndicator {
            FocusIndicatorView(indicator: indicator)
              .position(
                x: min(max(indicator.normalizedPoint.x * proxy.size.width, 24), proxy.size.width - 24),
                y: min(max(indicator.normalizedPoint.y * proxy.size.height, 24), proxy.size.height - 24)
              )
          }
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
    .buttonStyle(.plain)
    .accessibilityLabel("Undo last capture")
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
          let effectiveMax = max(cameraService.userFacingMaxZoom, cameraService.minZoom)
          let clamped = min(max(target, cameraService.minZoom), effectiveMax)
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
