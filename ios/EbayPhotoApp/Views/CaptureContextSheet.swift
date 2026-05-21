import SwiftUI

struct CaptureContextSheet: View {
  @EnvironmentObject private var appState: AppState
  @EnvironmentObject private var supabase: SupabaseService
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

          remoteWorkspaceSection
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
    syncCurrentWorkspace()
    dismiss()
  }

  @ViewBuilder
  private var remoteWorkspaceSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Remote workspace")
        .font(.headline)

      if appState.remoteWorkspaceStores.isEmpty {
        Text("Desktop stores and batches will appear here after the next sync.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      } else {
        ForEach(appState.remoteWorkspaceStores) { store in
          VStack(alignment: .leading, spacing: 6) {
            Text(store.name)
              .font(.subheadline.weight(.semibold))
            Text("\(store.shortCode) · \(store.batches.count) batch\(store.batches.count == 1 ? "" : "es")")
              .font(.footnote)
              .foregroundStyle(.secondary)
            ForEach(store.batches) { batch in
              Text(batch.name)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(12)
          .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
      }
    }
    .padding(.top, 8)
  }

  private func syncCurrentWorkspace() {
    Task {
      do {
        let result = try await supabase.syncCaptureContextToRemote(
          storeName: appState.captureStoreName,
          storeShortCode: appState.captureStoreShortCode,
          batchName: appState.captureBatchName,
          storeRemoteId: appState.captureStoreRemoteId,
          batchRemoteId: appState.captureBatchRemoteId
        )
        await MainActor.run {
          appState.applyRemoteWorkspaceContext(
            storeId: result.storeId,
            batchId: result.batchId,
            storeName: result.storeName,
            storeShortCode: result.storeShortCode,
            batchName: result.batchName
          )
          appState.statusMessage = "Capture context synced."
        }
      } catch {
        await MainActor.run {
          appState.statusMessage = "Capture context sync failed: \(error.localizedDescription)"
        }
      }
    }
  }
}
