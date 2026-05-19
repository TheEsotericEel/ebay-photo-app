import SwiftUI

struct ZoomControlRow: View {
  let currentZoom: Double
  let minZoom: Double
  let maxZoom: Double
  let onZoomChange: (Double) -> Void
  let formatZoom: (Double) -> String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Zoom")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Spacer()
        Text(formatZoom(currentZoom))
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
      }

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
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal)
  }
}
