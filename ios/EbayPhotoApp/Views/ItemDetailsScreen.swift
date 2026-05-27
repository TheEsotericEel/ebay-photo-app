import SwiftUI

struct ItemDetailsScreen<ThumbnailContent: View>: View {
  let itemNumber: Int
  let photoCount: Int
  @Binding var sku: String
  @Binding var weight: String
  @Binding var dimensions: String
  @Binding var notes: String
  let onCancel: () -> Void
  let onSubmit: () -> Void
  let onNextItem: () -> Void
  @ViewBuilder let thumbnailContent: () -> ThumbnailContent

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        CaptureFlowHero(
          eyebrow: "Finish Item",
          title: "Small checkpoint before queueing",
          message: "Use this checkpoint for the current item's optional details before queueing."
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

              CaptureStatusChip(title: "Optional Details")
            }

            thumbnailContent()

            VStack(alignment: .leading, spacing: 12) {
              Text("Details")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)

      ItemDetailsField(
        title: "SKU",
        placeholder: "Optional SKU",
        text: $sku,
        accessibilityIdentifier: "itemDetails.sku",
                autocapitalization: .characters,
                autocorrectionDisabled: true
              )

        HStack(alignment: .top, spacing: 10) {
          ItemDetailsField(
            title: "Weight",
            placeholder: "Optional weight",
            text: $weight,
                  accessibilityIdentifier: "itemDetails.weight",
                  autocorrectionDisabled: true
                )

          ItemDetailsField(
            title: "Dimensions",
            placeholder: "Optional dimensions",
            text: $dimensions,
            accessibilityIdentifier: "itemDetails.dimensions",
            autocorrectionDisabled: true
          )
        }

              ItemDetailsField(
                title: "Notes",
                placeholder: "Optional notes for this item",
                text: $notes,
                accessibilityIdentifier: "itemDetails.notes",
                isMultiline: true
              )
            }

            HStack(spacing: 10) {
              Button("Submit") {
                onSubmit()
              }
              .buttonStyle(.bordered)
              .tint(.white)
              .foregroundStyle(.white)
              .accessibilityIdentifier("itemDetails.submit")

              Button("Next Item") {
                onNextItem()
              }
              .buttonStyle(.borderedProminent)
              .tint(.white)
              .foregroundStyle(.black)
              .accessibilityIdentifier("itemDetails.nextItem")
            }
          }
        }
      }
      .padding(16)
    }
    .accessibilityIdentifier("itemDetails.screen")
    .background(CaptureFlowBackground())
    .navigationTitle("Finish Item")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button("Cancel", action: onCancel)
          .accessibilityIdentifier("itemDetails.cancel")
      }
    }
  }
}

#Preview("Item Details") {
  MockItemDetailsScreenPreview()
}

private struct MockItemDetailsScreenPreview: View {
  @State private var sku = "A-104"
  @State private var weight = "2.4 lb"
  @State private var dimensions = "8 x 10 in"
  @State private var notes = "Optional note for the lister."

  var body: some View {
    ItemDetailsScreen(
      itemNumber: 12,
      photoCount: 4,
      sku: $sku,
      weight: $weight,
      dimensions: $dimensions,
      notes: $notes,
      onCancel: {},
      onSubmit: {},
      onNextItem: {},
      thumbnailContent: {
        CaptureCameraThumbnailPanel(seed: 4, hasPhoto: true, photoCount: 4)
      }
    )
  }
}

private struct ItemDetailsField: View {
  let title: String
  let placeholder: String
  @Binding var text: String
  let accessibilityIdentifier: String
  var isMultiline = false
  var autocapitalization: TextInputAutocapitalization = .never
  var autocorrectionDisabled = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)

      if isMultiline {
        TextField(placeholder, text: $text, axis: .vertical)
          .lineLimit(2 ... 4)
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .fill(.white.opacity(0.08))
          }
          .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .stroke(.white.opacity(0.08), lineWidth: 1)
          }
          .foregroundStyle(.white)
          .textInputAutocapitalization(autocapitalization)
          .autocorrectionDisabled(autocorrectionDisabled)
          .accessibilityIdentifier(accessibilityIdentifier)
      } else {
        TextField(placeholder, text: $text)
          .lineLimit(1)
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .fill(.white.opacity(0.08))
          }
          .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
              .stroke(.white.opacity(0.08), lineWidth: 1)
          }
          .foregroundStyle(.white)
          .textInputAutocapitalization(autocapitalization)
          .autocorrectionDisabled(autocorrectionDisabled)
          .accessibilityIdentifier(accessibilityIdentifier)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
