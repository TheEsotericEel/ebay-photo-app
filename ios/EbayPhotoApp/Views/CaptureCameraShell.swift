import SwiftUI

struct CaptureCameraShell<PreviewContent: View, ThumbnailContent: View>: View {
  let itemNumber: Int
  let photoCount: Int
  @Binding var notes: String
  let canUndo: Bool
  let onExit: () -> Void
  let onUndo: () -> Void
  let onCapture: () -> Void
  let onNext: () -> Void
  let onDone: () -> Void
  @ViewBuilder let previewContent: () -> PreviewContent
  @ViewBuilder let thumbnailContent: () -> ThumbnailContent

  var body: some View {
    GeometryReader { geometry in
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top, spacing: 8) {
          CaptureTopCapsuleButton(title: "Exit", systemName: "chevron.left", action: onExit)

          if canUndo {
            CaptureTopCapsuleButton(title: "Undo", systemName: "arrow.uturn.backward", action: onUndo)
          }

          Spacer(minLength: 0)

          VStack(alignment: .trailing, spacing: 6) {
            VStack(alignment: .trailing, spacing: 2) {
              Text("Item \(itemNumber)")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
              Text("\(photoCount) photo\(photoCount == 1 ? "" : "s")")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }

            CaptureTopCapsuleButton(title: "Done", systemName: nil, isFilled: true, foreground: .black, action: onDone)
          }
        }

        previewContent()
          .frame(maxWidth: .infinity)

        VStack(alignment: .leading, spacing: 8) {
          Text("Notes")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)

          TextField("Optional notes / SKU / damage...", text: $notes, axis: .vertical)
            .lineLimit(2 ... 3)
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
        }

        Spacer(minLength: 0)

        HStack(alignment: .bottom, spacing: 12) {
          thumbnailContent()
            .frame(width: 84, alignment: .leading)

          VStack(spacing: 8) {
            Text("Capture")
              .font(.headline.weight(.semibold))
              .foregroundStyle(.white)

            Button(action: onCapture) {
              ZStack {
                Circle()
                  .fill(.white)
                  .frame(width: 96, height: 96)
                Circle()
                  .stroke(.white.opacity(0.95), lineWidth: 5)
                  .frame(width: 84, height: 84)
              }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Capture")
          }
          .frame(maxWidth: .infinity)

          Button(action: onNext) {
            Text("Next")
              .font(.headline.weight(.semibold))
              .foregroundStyle(.black)
              .padding(.horizontal, 24)
              .padding(.vertical, 12)
              .background {
                Capsule(style: .continuous)
                  .fill(photoCount > 0 ? .white : .white.opacity(0.28))
              }
          }
          .buttonStyle(.plain)
          .disabled(photoCount == 0)
          .opacity(photoCount > 0 ? 1 : 0.6)
          .frame(width: 92, alignment: .trailing)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 6)
      .padding(.bottom, max(geometry.safeAreaInsets.bottom, 10))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
    .background(CaptureFlowBackground())
    .toolbar(.hidden, for: .navigationBar)
  }
}

#Preview("Capture Shell") {
  MockCaptureCameraShellPreview()
}

private struct MockCaptureCameraShellPreview: View {
  @State private var notes = "Small scratch on back cover."

  var body: some View {
    CaptureCameraShell(
      itemNumber: 12,
      photoCount: 4,
      notes: $notes,
      canUndo: true,
      onExit: {},
      onUndo: {},
      onCapture: {},
      onNext: {},
      onDone: {},
      previewContent: {
        CaptureCameraPreviewSurface(
          photoCount: 4,
          seed: 4,
          gridEnabled: true,
          levelEnabled: false,
          selectedLens: "1x"
        )
      },
      thumbnailContent: {
        CaptureCameraThumbnailPanel(seed: 4, hasPhoto: true, photoCount: 4)
      }
    )
  }
}
