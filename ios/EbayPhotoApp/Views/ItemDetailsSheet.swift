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
          labeledField(title: "SKU", text: $sku)
          labeledField(title: "Weight", text: $weight)
          labeledField(title: "Dimensions", text: $dimensions)
          labeledField(title: "Notes", text: $notes)
        }
        .padding()
      }
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

  private func labeledField(title: String, text: Binding<String>) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.caption)
        .foregroundStyle(.secondary)
      TextField(title, text: text)
        .textFieldStyle(.roundedBorder)
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
