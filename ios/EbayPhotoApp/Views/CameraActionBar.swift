import SwiftUI

struct CameraActionBar: View {
  let canUndo: Bool
  let canCapture: Bool
  let onUndo: () -> Void
  let onCapture: () -> Void
  let onNextItem: () -> Void
  let onDone: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button("Undo", action: onUndo)
        .buttonStyle(.bordered)
        .disabled(!canUndo)

      Button("Capture", action: onCapture)
        .buttonStyle(.borderedProminent)
        .disabled(!canCapture)

      Button("Next Item", action: onNextItem)
        .buttonStyle(.bordered)

      Button("Done", action: onDone)
        .buttonStyle(.bordered)
    }
    .padding(.horizontal)
  }
}
