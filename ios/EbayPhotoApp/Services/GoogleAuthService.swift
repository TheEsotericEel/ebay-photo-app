import CryptoKit
import Foundation
import GoogleSignIn
import Security
import UIKit

struct GoogleAuthTokens {
  let idToken: String
  let accessToken: String
  let rawNonce: String
}

enum GoogleAuthNonce {
  private static let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")

  static func makeRaw(length: Int = 32) throws -> String {
    guard length > 0 else {
      throw AppServiceError.server("Google sign-in could not prepare a secure login challenge.")
    }

    var randomBytes = [UInt8](repeating: 0, count: length)
    let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
    guard status == errSecSuccess else {
      throw AppServiceError.server("Google sign-in could not prepare a secure login challenge.")
    }

    return String(randomBytes.map { charset[Int($0) % charset.count] })
  }

  static func sha256Hex(_ value: String) -> String {
    let digest = SHA256.hash(data: Data(value.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}

struct GoogleAuthService {
  static let live = GoogleAuthService()

  @MainActor
  func signIn() async throws -> GoogleAuthTokens {
    let configuration = try makeConfiguration()
    GIDSignIn.sharedInstance.configuration = configuration

    let presentingViewController = try presentingViewController()
    let rawNonce = try GoogleAuthNonce.makeRaw()
    // Supabase expects the original nonce, while Google expects its SHA-256 hex form in the ID token flow.
    let googleNonce = GoogleAuthNonce.sha256Hex(rawNonce)
    let signInResult = try await signInResult(
      withPresenting: presentingViewController,
      nonce: googleNonce
    )

    guard let idToken = signInResult.user.idToken?.tokenString, !idToken.isEmpty else {
      throw AppServiceError.server("Google sign-in did not return an ID token.")
    }

    let accessToken = signInResult.user.accessToken.tokenString
    guard !accessToken.isEmpty else {
      throw AppServiceError.server("Google sign-in did not return an access token.")
    }

    return GoogleAuthTokens(idToken: idToken, accessToken: accessToken, rawNonce: rawNonce)
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
  private func signInResult(
    withPresenting presentingViewController: UIViewController,
    nonce: String
  ) async throws -> GIDSignInResult {
    try await withCheckedThrowingContinuation { continuation in
      GIDSignIn.sharedInstance.signIn(
        withPresenting: presentingViewController,
        hint: nil,
        additionalScopes: nil,
        nonce: nonce
      ) { signInResult, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let signInResult else {
          continuation.resume(throwing: AppServiceError.server("Google sign-in did not complete."))
          return
        }

        continuation.resume(returning: signInResult)
      }
    }
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
