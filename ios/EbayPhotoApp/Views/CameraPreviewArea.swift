import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewArea: View {
  let session: AVCaptureSession
  @ObservedObject var cameraService: CameraService
  @ObservedObject var cameraPreferences: CameraPreferencesStore
  @Binding var pinchStartZoom: Double?
  let thumbnailImage: UIImage?
  let onSelectLens: (CameraLensPreset) -> Void
  let onToggleLockForSelectedLens: (CameraLensPreset) -> Void

  var body: some View {
    ZStack(alignment: .bottomTrailing) {
      CameraPreviewView(session: session)
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

      if let thumbnailImage {
        VStack {
          Spacer()
          HStack {
            thumbnailPreview(thumbnailImage)
            Spacer()
          }
        }
        .padding(.leading, 20)
        .padding(.bottom, 28)
      }

      LensChipRow(
        preferredLens: cameraPreferences.preferredLens,
        switchingMode: cameraPreferences.switchingMode,
        supportedLenses: cameraService.supportedLenses,
        onSelectLens: onSelectLens,
        onToggleLockForSelectedLens: onToggleLockForSelectedLens
      )
      .padding(.trailing, 24)
      .padding(.bottom, 28)
    }
    .padding(.top, 4)
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
