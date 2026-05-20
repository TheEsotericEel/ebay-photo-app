import SwiftUI

@main
struct EbayPhotoAppApp: App {
  @StateObject private var appState = AppState()
  @StateObject private var supabase = SupabaseService()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(appState)
        .environmentObject(supabase)
    }
  }
}
