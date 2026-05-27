import SwiftUI

struct CameraTopBar: View {
  let title: String
  let photoCount: Int
  let onBack: () -> Void
  let onDone: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      Button(action: onBack) {
        Image(systemName: "chevron.left")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: 32, height: 32)
          .background {
            Circle()
              .fill(.white.opacity(0.12))
          }
          .overlay {
            Circle()
              .stroke(.white.opacity(0.18), lineWidth: 1)
          }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Back")
      .accessibilityIdentifier("liveCamera.back")

      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.85)
        .frame(maxWidth: .infinity, alignment: .leading)

      Text("\(photoCount)")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .monospacedDigit()
        .accessibilityLabel("\(photoCount) photos captured")
        .accessibilityIdentifier("liveCamera.photoCount")

      Button(action: onDone) {
        Text("Done")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .frame(height: 32)
          .background {
            Capsule(style: .continuous)
              .fill(.white.opacity(0.12))
          }
          .overlay {
            Capsule(style: .continuous)
              .stroke(.white.opacity(0.18), lineWidth: 1)
          }
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("liveCamera.done")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 2)
  }
}
