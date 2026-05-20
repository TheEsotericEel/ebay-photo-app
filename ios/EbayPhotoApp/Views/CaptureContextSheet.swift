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
      Form {
        Section("Capture Context") {
          TextField("Store name", text: $storeName)
          TextField("Store short code", text: $storeShortCode)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
          TextField("Batch name", text: $batchName)
          TextField("Item number", text: $itemNumberText)
            .keyboardType(.numberPad)
        }

        Section {
          Text("Uploads use this store, batch, and item number.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
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
