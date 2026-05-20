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
          LabeledTextField(title: "Store name", text: $storeName)
          LabeledTextField(
            title: "Store short code",
            text: $storeShortCode,
            autocapitalize: .characters,
            autocorrectDisabled: true
          )
          LabeledTextField(title: "Batch name", text: $batchName)
          LabeledTextField(
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
      .scrollDismissesKeyboard(.interactively)
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
