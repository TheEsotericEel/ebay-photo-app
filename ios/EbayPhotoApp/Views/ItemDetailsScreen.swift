import SwiftUI

struct ItemDetailsScreen<ThumbnailContent: View>: View {
  let itemNumber: Int
  let photoCount: Int
  @Binding var notes: String
  let onSubmit: () -> Void
  let onNextItem: () -> Void
  @ViewBuilder let thumbnailContent: () -> ThumbnailContent

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        CaptureFlowHero(
          eyebrow: "Finish Item",
          title: "Small checkpoint before queueing",
          message: "For now this screen only asks for notes. It is intentionally not a listing form."
        )

        CaptureSurfaceCard {
          VStack(alignment: .leading, spacing: 16) {
            HStack {
              VStack(alignment: .leading, spacing: 4) {
                Text("Item \(itemNumber)")
                  .font(.title3.weight(.semibold))
                  .foregroundStyle(.white)
                Text("\(photoCount) photo(s) ready to queue")
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
              }

              Spacer(minLength: 0)

              CaptureStatusChip(title: "Notes Only")
            }

            thumbnailContent()

            VStack(alignment: .leading, spacing: 8) {
              Text("Notes")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)

              TextField("Add optional notes for this item", text: $notes, axis: .vertical)
                .lineLimit(3 ... 7)
                .padding(14)
                .background {
                  RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(0.08))
                }
                .overlay {
                  RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(.white.opacity(0.08), lineWidth: 1)
                }
                .foregroundStyle(.white)
            }

            HStack(spacing: 10) {
              Button("Submit") {
                onSubmit()
              }
              .buttonStyle(.bordered)
              .tint(.white)
              .foregroundStyle(.white)

              Button("Next Item") {
                onNextItem()
              }
              .buttonStyle(.borderedProminent)
              .tint(.white)
              .foregroundStyle(.black)
            }
          }
        }
      }
      .padding(16)
    }
    .background(CaptureFlowBackground())
    .navigationTitle("Finish Item")
    .navigationBarTitleDisplayMode(.inline)
  }
}

#Preview("Item Details") {
  MockItemDetailsScreenPreview()
}

private struct MockItemDetailsScreenPreview: View {
  @State private var notes = "Optional note for the lister."

  var body: some View {
    ItemDetailsScreen(
      itemNumber: 12,
      photoCount: 4,
      notes: $notes,
      onSubmit: {},
      onNextItem: {},
      thumbnailContent: {
        CaptureCameraThumbnailPanel(seed: 4, hasPhoto: true, photoCount: 4)
      }
    )
  }
}
