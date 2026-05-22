import SwiftUI

struct GuideToggleRow: View {
  @Binding var gridEnabled: Bool
  @Binding var horizonGuideEnabled: Bool
  let showsTapToFocusHint: Bool

  var body: some View {
    HStack(spacing: 6) {
      guideChip("Grid", isOn: gridEnabled) {
        gridEnabled.toggle()
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
    .padding(.horizontal, 16)
  }

  private func guideChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.caption2.weight(.semibold))
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
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
