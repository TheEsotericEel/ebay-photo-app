import SwiftUI

struct LensChipRow: View {
  let preferredLens: CameraLensPreset
  let switchingMode: LensSwitchingMode
  let supportedLenses: Set<CameraLensPreset>
  let onSelectLens: (CameraLensPreset) -> Void
  let onToggleLockForSelectedLens: (CameraLensPreset) -> Void

  var body: some View {
    HStack(spacing: 8) {
      lensChip(.ultraWide)
      lensChip(.wide)
    }
    .padding(8)
    .background(.black.opacity(0.22))
    .clipShape(Capsule(style: .continuous))
    .overlay(
      Capsule(style: .continuous)
        .stroke(.white.opacity(0.15), lineWidth: 1)
    )
  }

  private func lensChip(_ lens: CameraLensPreset) -> some View {
    let isSelected = preferredLens == lens
    let isLocked = isSelected && switchingMode == .locked
    let supported = supportedLenses.isEmpty || supportedLenses.contains(lens)

    return Button {
      guard supported else { return }
      onSelectLens(lens)
    } label: {
      VStack(spacing: 2) {
        Text(lens.rawValue)
          .font(.headline.weight(.semibold))
          .frame(width: 40, height: 32)

        Text(isLocked ? "LOCK" : "AUTO")
          .font(.caption2.weight(.semibold))
          .tracking(0.6)
          .opacity(isSelected ? 1 : 0.55)
      }
      .foregroundStyle(isSelected ? .black : .white)
      .padding(.vertical, 4)
      .padding(.horizontal, 6)
      .background {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(isSelected ? Color.white : Color.black.opacity(0.35))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(isLocked ? Color.orange.opacity(0.9) : Color.white.opacity(0.18), lineWidth: isLocked ? 2 : 1)
      }
    }
    .buttonStyle(.plain)
    .disabled(supported == false)
    .onLongPressGesture {
      guard supported, isSelected else { return }
      onToggleLockForSelectedLens(lens)
    }
  }
}
