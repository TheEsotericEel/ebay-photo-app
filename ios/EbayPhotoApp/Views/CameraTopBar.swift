import SwiftUI

struct CameraTopBar: View {
  let title: String
  let photoCount: Int
  let onBack: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button(action: onBack) {
        Image(systemName: "chevron.left")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
          .frame(width: 36, height: 36)
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

      VStack(spacing: 2) {
        Text(title)
          .font(.headline.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.85)

        Text("Camera-first capture")
          .font(.caption2.weight(.medium))
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity)

      Text("\(photoCount) photo\(photoCount == 1 ? "" : "s")")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(minWidth: 64, alignment: .trailing)
    }
    .padding(.horizontal, 16)
    .padding(.top, 2)
  }
}
