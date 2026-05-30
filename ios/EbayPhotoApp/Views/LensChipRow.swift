import SwiftUI

/// Compact expandable lens selector.
///
/// Collapsed: one capsule showing the active mode label (.5 / 1x / AUTO).
/// Expanded: three direct-tap buttons side-by-side. Selecting one applies it
/// and collapses back to the single chip.
///
/// Device mapping (via CameraService):
///   .5   → builtInUltraWideCamera,  switchingMode = .locked
///   1x   → builtInWideAngleCamera,  switchingMode = .locked
///   AUTO → builtInDualWideCamera,   switchingMode = .auto
///
/// AUTO selection always sets .auto — it does NOT toggle. The callback in
/// RootView is wired accordingly (sets .auto unconditionally).
struct LensChipRow: View {
  let preferredLens: CameraLensPreset
  let switchingMode: LensSwitchingMode
  let supportedLenses: Set<CameraLensPreset>
  let onSelectLens: (CameraLensPreset) -> Void
  let onSelectAuto: () -> Void

  @State private var isExpanded = false

  // MARK: - Active label shown when collapsed

  private var activeLabel: String {
    switch switchingMode {
    case .auto:   return "AUTO"
    case .locked: return preferredLens == .ultraWide ? ".5" : "1x"
    }
  }

  // MARK: - Body

  var body: some View {
    Group {
      if isExpanded {
        expandedRow
      } else {
        collapsedChip
      }
    }
    .animation(.easeInOut(duration: 0.15), value: isExpanded)
  }

  // MARK: - Collapsed

  private var collapsedChip: some View {
    Button { isExpanded = true } label: {
      Text(activeLabel)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .padding(.vertical, 6)
        .padding(.horizontal, 18)
        .background {
          Capsule(style: .continuous)
            .fill(Color.black.opacity(0.45))
        }
        .overlay {
          Capsule(style: .continuous)
            .stroke(Color.white.opacity(0.25), lineWidth: 1)
        }
    }
    .buttonStyle(PressFeedbackButtonStyle())
  }

  // MARK: - Expanded

  private var expandedRow: some View {
    HStack(spacing: 6) {
      lensChip(label: ".5",   isSelected: switchingMode == .locked && preferredLens == .ultraWide) {
        CameraFeedback.selection()
        onSelectLens(.ultraWide)
        isExpanded = false
      }
      lensChip(label: "1x",   isSelected: switchingMode == .locked && preferredLens == .wide) {
        CameraFeedback.selection()
        onSelectLens(.wide)
        isExpanded = false
      }
      lensChip(label: "AUTO", isSelected: switchingMode == .auto) {
        if switchingMode != .auto { onSelectAuto() }
        CameraFeedback.selection()
        isExpanded = false
      }
    }
  }

  // MARK: - Chip builder

  @ViewBuilder
  private func lensChip(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(label)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(isSelected ? .black : .white)
        .padding(.vertical, 6)
        .padding(.horizontal, 14)
        .background {
          Capsule(style: .continuous)
            .fill(isSelected ? Color.white : Color.black.opacity(0.45))
        }
        .overlay {
          Capsule(style: .continuous)
            .stroke(isSelected ? Color.clear : Color.white.opacity(0.22), lineWidth: 1)
        }
    }
    .buttonStyle(PressFeedbackButtonStyle())
  }
}
