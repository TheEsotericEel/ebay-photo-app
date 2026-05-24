import SwiftUI

@main
struct EbayPhotoAppApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var appState = AppState()
  @StateObject private var supabase = SupabaseService()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(appState)
        .environmentObject(supabase)
        .portraitLocked()
    }
  }
}
