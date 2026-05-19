import SwiftUI

/// Three-mode lens selector. Tap to cycle: 1x → .5 → AUTO → 1x → …
///
/// Modes map to physical devices via CameraService.selectDevice:
///   1x   → builtInWideAngleCamera  (switchingMode: .locked)
///   .5   → builtInUltraWideCamera  (switchingMode: .locked)
///   AUTO → builtInDualWideCamera   (switchingMode: .auto, system-managed)
///
/// Lock/auto is internal plumbing only — not surfaced in the UI.
struct LensChipRow: View {
  let preferredLens: CameraLensPreset
  let switchingMode: LensSwitchingMode
  let supportedLenses: Set<CameraLensPreset>
  let onSelectLens: (CameraLensPreset) -> Void
  let onToggleLockForSelectedLens: (CameraLensPreset) -> Void

  var body: some View {
    Button(action: cycleLensMode) {
      VStack(spacing: 2) {
        Text(mainLabel)
          .font(.subheadline.weight(.semibold))

        Text(subLabel)
          .font(.system(size: 10, weight: .medium))
          .tracking(0.5)
          .foregroundStyle(.white.opacity(0.5))
      }
      .foregroundStyle(.white)
      .padding(.vertical, 6)
      .padding(.horizontal, 16)
      .background {
        Capsule(style: .continuous)
          .fill(Color.black.opacity(0.45))
      }
      .overlay {
        Capsule(style: .continuous)
          .stroke(Color.white.opacity(0.22), lineWidth: 1)
      }
    }
    .buttonStyle(.plain)
  }

  // MARK: - Labels

  private var mainLabel: String {
    switch switchingMode {
    case .locked: return preferredLens.rawValue
    case .auto:   return "AUTO"
    }
  }

  private var subLabel: String {
    switch switchingMode {
    case .locked:
      return preferredLens == .wide ? "WIDE" : "ULTRA"
    case .auto:
      return "LENS"
    }
  }

  // MARK: - Cycle

  /// 1x (wide, locked) → .5 (ultrawide, locked) → AUTO → 1x → …
  private func cycleLensMode() {
    switch (switchingMode, preferredLens) {
    case (.locked, .wide):
      onSelectLens(.ultraWide)

    case (.locked, .ultraWide):
      onToggleLockForSelectedLens(preferredLens)  // → .auto

    case (.auto, _):
      onSelectLens(.wide)  // → 1x locked
    }
  }
}
