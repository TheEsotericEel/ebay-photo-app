import SwiftUI

@main
struct EbayPhotoAppApp: App {
  @StateObject private var appState = AppState()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environmentObject(appState)
    }
  }
}
