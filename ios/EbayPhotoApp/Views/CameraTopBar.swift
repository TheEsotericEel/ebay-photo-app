import SwiftUI

struct CameraTopBar: View {
  let title: String
  let photoCount: Int
  let onBack: () -> Void
  let onDone: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
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
      .buttonStyle(PressFeedbackButtonStyle())
      .accessibilityLabel("Back")
      .accessibilityIdentifier("liveCamera.back")

      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.9)

        Text("\(photoCount) photo\(photoCount == 1 ? "" : "s")")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
          .monospacedDigit()
          .accessibilityLabel("\(photoCount) photos captured")
          .accessibilityIdentifier("liveCamera.photoCount")
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Button(action: onDone) {
        Text("Done")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 14)
          .frame(minWidth: 86, minHeight: 34)
          .background {
            Capsule(style: .continuous)
              .fill(.white.opacity(0.12))
          }
          .overlay {
          Capsule(style: .continuous)
            .stroke(.white.opacity(0.18), lineWidth: 1)
          }
      }
      .buttonStyle(PressFeedbackButtonStyle())
      .accessibilityIdentifier("liveCamera.done")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 2)
  }
}
