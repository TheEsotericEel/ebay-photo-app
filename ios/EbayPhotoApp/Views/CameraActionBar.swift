import SwiftUI
import UIKit

struct CameraActionBar: View {
  let thumbnailImage: UIImage?
  let photoCount: Int
  let canCapture: Bool
  let onCapture: () -> Void
  let onNextItem: () -> Void
  let onDone: () -> Void
  private let captureButtonSize: CGFloat = 84

  var body: some View {
    HStack(alignment: .bottom, spacing: 14) {
      VStack(spacing: 6) {
        thumbnailView
        Text("\(photoCount) photo\(photoCount == 1 ? "" : "s")")
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
      }
      .frame(width: 72)

      Spacer(minLength: 0)

      Button(action: onCapture) {
        Circle()
          .fill(.white)
          .frame(width: captureButtonSize, height: captureButtonSize)
          .overlay {
            Circle()
              .stroke(.white.opacity(0.9), lineWidth: 6)
              .padding(4)
          }
          .overlay {
            Circle()
              .stroke(Color.black.opacity(canCapture ? 0.22 : 0.12), lineWidth: 1.5)
          }
          .shadow(color: .black.opacity(canCapture ? 0.28 : 0.12), radius: 10, x: 0, y: 6)
          .scaleEffect(canCapture ? 1 : 0.96)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Capture")
      .disabled(!canCapture)

      Spacer(minLength: 0)

      VStack(spacing: 10) {
        secondaryButton("Next", action: onNextItem)
        secondaryButton("Done", action: onDone)
      }
      .frame(width: 108)
    }
    .padding(.horizontal, 16)
    .padding(.top, 2)
    .padding(.bottom, 2)
  }

  private var thumbnailView: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(.white.opacity(0.08))
        .frame(width: 58, height: 58)

      if let thumbnailImage {
        Image(uiImage: thumbnailImage)
          .resizable()
          .scaledToFill()
          .frame(width: 58, height: 58)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      } else {
        Image(systemName: "photo")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(.secondary)
      }

      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(.white.opacity(0.14), lineWidth: 1)
    }
    .accessibilityLabel("Last photo thumbnail")
  }

  private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 38)
        .padding(.horizontal, 10)
        .background {
          Capsule(style: .continuous)
            .fill(.white.opacity(title == "Done" ? 0.14 : 0.1))
        }
        .overlay {
          Capsule(style: .continuous)
            .stroke(.white.opacity(title == "Done" ? 0.18 : 0.14), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
  }
}
