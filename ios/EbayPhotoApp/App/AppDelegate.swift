import UIKit

/// Portrait-only interface orientations for the capture app (see migration spec).
enum OrientationLock {
  static let supportedMask: UIInterfaceOrientationMask = .portrait

  /// Re-applies portrait geometry when the app becomes active (e.g. after Control Center).
  static func enforcePortrait() {
    AppDelegate.shared?.orientationLock = supportedMask

    guard let windowScene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first(where: { $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive })
    else {
      return
    }

    windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
  }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
  private(set) static weak var shared: AppDelegate?

  var orientationLock: UIInterfaceOrientationMask = OrientationLock.supportedMask

  override init() {
    super.init()
    Self.shared = self
  }

  func application(
    _ application: UIApplication,
    supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    orientationLock
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    OrientationLock.enforcePortrait()
  }
}
