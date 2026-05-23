import SwiftUI

struct ZoomControlRow: View {
  let currentZoom: Double
  let minZoom: Double
  let maxZoom: Double
  let onZoomChange: (Double) -> Void
  let formatZoom: (Double) -> String

  var body: some View {
    HStack(spacing: 10) {
      if maxZoom > minZoom + 0.01 {
        Slider(
          value: Binding(
            get: { currentZoom },
            set: { newValue in
              onZoomChange(newValue)
            }
          ),
          in: minZoom...maxZoom,
          step: 0.01
        )
      } else {
        Text("Zoom unavailable")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      Text(formatZoom(currentZoom))
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
        .monospacedDigit()
        .frame(minWidth: 36, alignment: .trailing)
    }
    .padding(.horizontal, 4)
    .padding(.vertical, 2)
  }
}
