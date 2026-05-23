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
        Text("Tap focus")
          .font(.caption2)
          .foregroundStyle(.secondary.opacity(0.85))
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 1)
  }

  private func guideChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.caption2.weight(.semibold))
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
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
