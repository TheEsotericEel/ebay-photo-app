import SwiftUI

/// Keeps the interface in portrait when the device is rotated.
struct PortraitLockedModifier: ViewModifier {
  func body(content: Content) -> some View {
    content
      .onAppear {
        OrientationLock.enforcePortrait()
      }
  }
}

extension View {
  func portraitLocked() -> some View {
    modifier(PortraitLockedModifier())
  }
}
