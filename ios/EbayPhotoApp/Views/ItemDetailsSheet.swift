import SwiftUI

struct ItemDetailsSheet: View {
  @EnvironmentObject private var appState: AppState
  @Environment(\.dismiss) private var dismiss

  @State private var sku = ""
  @State private var weight = ""
  @State private var dimensions = ""
  @State private var notes = ""

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          LabeledTextField(title: "SKU", text: $sku)
          LabeledTextField(title: "Weight", text: $weight)
          LabeledTextField(title: "Dimensions", text: $dimensions)
          LabeledTextField(title: "Notes", text: $notes)
        }
        .padding()
      }
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle("Details")
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
    sku = appState.currentItemSku
    weight = appState.currentItemWeight
    dimensions = appState.currentItemDimensions
    notes = appState.currentItemNotes
  }

  private func applyAndDismiss() {
    appState.currentItemSku = sku
    appState.currentItemWeight = weight
    appState.currentItemDimensions = dimensions
    appState.currentItemNotes = notes
    dismiss()
  }
}
