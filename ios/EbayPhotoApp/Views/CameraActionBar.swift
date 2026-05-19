import SwiftUI

struct CameraActionBar: View {
  let canUndo: Bool
  let canCapture: Bool
  let onUndo: () -> Void
  let onCapture: () -> Void
  let onNextItem: () -> Void
  let onDone: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      HStack {
        Spacer(minLength: 0)
        Button(action: onCapture) {
          Text("Capture")
            .font(.headline.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.9)
            .frame(minWidth: 160)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .clipShape(Capsule(style: .continuous))
        .disabled(!canCapture)
        Spacer(minLength: 0)
      }

      HStack(spacing: 10) {
        secondaryButton("Undo", action: onUndo)
          .disabled(!canUndo)

        secondaryButton("Next", action: onNextItem)

        secondaryButton("Done", action: onDone)
      }
    }
    .padding(.horizontal)
    .padding(.bottom, 6)
  }

  private func secondaryButton(_ title: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.9)
        .frame(maxWidth: .infinity, minHeight: 44)
        .padding(.horizontal, 10)
    }
    .buttonStyle(.bordered)
    .controlSize(.regular)
    .clipShape(Capsule(style: .continuous))
  }
}
