import Foundation
import GoogleSignIn
import UIKit

struct GoogleAuthTokens {
  let idToken: String
  let accessToken: String
}

struct GoogleAuthService {
  static let live = GoogleAuthService()

  @MainActor
  func signIn() async throws -> GoogleAuthTokens {
    let configuration = try makeConfiguration()
    GIDSignIn.sharedInstance.configuration = configuration

    let presentingViewController = try presentingViewController()
    let signInResult = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)

    guard let idToken = signInResult.user.idToken?.tokenString, !idToken.isEmpty else {
      throw AppServiceError.server("Google sign-in did not return an ID token.")
    }

    let accessToken = signInResult.user.accessToken.tokenString
    guard !accessToken.isEmpty else {
      throw AppServiceError.server("Google sign-in did not return an access token.")
    }

    return GoogleAuthTokens(idToken: idToken, accessToken: accessToken)
  }

  func signOut() {
    GIDSignIn.sharedInstance.signOut()
  }

  private func makeConfiguration() throws -> GIDConfiguration {
    let clientID = try bundleValue(for: "GIDClientID", configKey: "GOOGLE_IOS_CLIENT_ID")
    let serverClientID = try bundleValue(for: "GIDServerClientID", configKey: "GOOGLE_SERVER_CLIENT_ID")
    return GIDConfiguration(clientID: clientID, serverClientID: serverClientID)
  }

  private func bundleValue(for infoKey: String, configKey: String) throws -> String {
    let value = (Bundle.main.object(forInfoDictionaryKey: infoKey) as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value, !value.isEmpty else {
      throw AppServiceError.notConfigured("Google sign-in is not configured. Missing \(configKey).")
    }
    return value
  }

  @MainActor
  private func presentingViewController() throws -> UIViewController {
    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive }),
      let rootViewController = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      throw AppServiceError.server("Google sign-in could not find an active presentation window.")
    }

    return Self.topViewController(from: rootViewController)
  }

  private static func topViewController(from viewController: UIViewController) -> UIViewController {
    if let presentedViewController = viewController.presentedViewController {
      return topViewController(from: presentedViewController)
    }

    if let navigationController = viewController as? UINavigationController,
      let visibleViewController = navigationController.visibleViewController {
      return topViewController(from: visibleViewController)
    }

    if let tabBarController = viewController as? UITabBarController,
      let selectedViewController = tabBarController.selectedViewController {
      return topViewController(from: selectedViewController)
    }

    return viewController
  }
}
