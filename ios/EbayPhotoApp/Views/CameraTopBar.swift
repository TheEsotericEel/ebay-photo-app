import SwiftUI

struct CameraTopBar: View {
  let contextLabel: String
  let photoCount: Int
  let onBack: () -> Void
  let onContext: () -> Void
  let onDetails: () -> Void

  var body: some View {
    VStack(spacing: 6) {
      HStack {
        Button("Back", action: onBack)

        Spacer()

        Text("\(photoCount) photo(s)")
          .font(.caption)
          .foregroundStyle(.secondary)

        Spacer()

        Button("Details", action: onDetails)
      }

      Button(action: onContext) {
        Text(contextLabel)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 6)
          .padding(.horizontal, 10)
          .background {
            Capsule(style: .continuous)
              .fill(Color.white.opacity(0.14))
          }
          .overlay {
            Capsule(style: .continuous)
              .stroke(Color.white.opacity(0.22), lineWidth: 1)
          }
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal)
    .padding(.top, 4)
  }
}
