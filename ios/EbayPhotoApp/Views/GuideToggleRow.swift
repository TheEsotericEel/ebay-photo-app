import SwiftUI

struct GuideToggleRow: View {
  @Binding var gridEnabled: Bool
  @Binding var squareGuideEnabled: Bool
  @Binding var horizonGuideEnabled: Bool
  let showsTapToFocusHint: Bool

  var body: some View {
    HStack(spacing: 8) {
      guideChip("Grid", isOn: gridEnabled) {
        gridEnabled.toggle()
      }
      guideChip("1:1", isOn: squareGuideEnabled) {
        squareGuideEnabled.toggle()
      }
      guideChip("Horizon", isOn: horizonGuideEnabled) {
        horizonGuideEnabled.toggle()
      }
      Spacer()
      if showsTapToFocusHint {
        Text("Tap to focus")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal)
  }

  private func guideChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.caption.weight(.semibold))
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background {
          Capsule(style: .continuous)
            .fill(isOn ? Color.white : Color.white.opacity(0.08))
        }
        .foregroundStyle(isOn ? .black : .primary)
        .overlay {
          Capsule(style: .continuous)
            .stroke(Color.white.opacity(0.14), lineWidth: 1)
        }
    }
    .buttonStyle(.plain)
  }
}
