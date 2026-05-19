import SwiftUI

struct CameraTopBar: View {
  let itemNumber: Int
  let photoCount: Int
  let onBack: () -> Void
  let onDetails: () -> Void

  var body: some View {
    HStack {
      Button("Back", action: onBack)

      Spacer()

      VStack(spacing: 2) {
        Text("Item \(itemNumber)")
          .font(.headline)
        Text("\(photoCount) photo(s)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Button("Details", action: onDetails)
    }
    .padding(.horizontal)
    .padding(.top, 4)
  }
}
