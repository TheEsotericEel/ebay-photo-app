import SwiftUI

struct CaptureContextSheet: View {
  @EnvironmentObject private var appState: AppState
  @Environment(\.dismiss) private var dismiss

  @State private var storeName = ""
  @State private var storeShortCode = ""
  @State private var batchName = ""
  @State private var itemNumberText = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          labeledField(title: "Store name", text: $storeName)
          labeledField(
            title: "Store short code",
            text: $storeShortCode,
            autocapitalize: .characters,
            autocorrectDisabled: true
          )
          labeledField(title: "Batch name", text: $batchName)
          labeledField(
            title: "Item number",
            text: $itemNumberText,
            keyboardType: .numberPad
          )

          Text("Uploads use this store, batch, and item number.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding()
      }
      .navigationTitle("Capture Context")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done", action: applyAndDismiss)
        }
      }
      .onAppear(perform: loadDraftFromAppState)
    }
  }

  @ViewBuilder
  private func labeledField(
    title: String,
    text: Binding<String>,
    autocapitalize: TextInputAutocapitalization? = nil,
    autocorrectDisabled: Bool = false,
    keyboardType: UIKeyboardType = .default
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.caption)
        .foregroundStyle(.secondary)
      TextField(title, text: text)
        .textFieldStyle(.roundedBorder)
        .keyboardType(keyboardType)
        .modifier(OptionalAutocapitalize(autocapitalize: autocapitalize))
        .autocorrectionDisabled(autocorrectDisabled)
    }
  }

  private func loadDraftFromAppState() {
    storeName = appState.captureStoreName
    storeShortCode = appState.captureStoreShortCode
    batchName = appState.captureBatchName
    itemNumberText = "\(appState.currentItemNumber)"
  }

  private func applyAndDismiss() {
    let parsedItemNumber = Int(itemNumberText.trimmingCharacters(in: .whitespacesAndNewlines))
      ?? appState.currentItemNumber
    appState.applyCaptureContext(
      storeName: storeName,
      storeShortCode: storeShortCode,
      batchName: batchName,
      itemNumber: parsedItemNumber
    )
    appState.statusMessage = "Capture context updated."
    dismiss()
  }
}

private struct OptionalAutocapitalize: ViewModifier {
  let autocapitalize: TextInputAutocapitalization?

  func body(content: Content) -> some View {
    if let autocapitalize {
      content.textInputAutocapitalization(autocapitalize)
    } else {
      content
    }
  }
}
