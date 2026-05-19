import Foundation

enum AppServiceError: LocalizedError {
  case notConfigured(String)

  var errorDescription: String? {
    switch self {
    case .notConfigured(let message):
      return message
    }
  }
}

final class SupabaseService {
  func sendOTP(email: String) async throws {
    guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }
    #if DEBUG
    // Development-only stub: keep the auth flow in place without requiring a
    // live Supabase project, secrets, or a working OTP backend yet.
    return
    #else
    throw AppServiceError.notConfigured("Supabase auth is not wired yet.")
    #endif
  }

  func verifyOTP(email: String, code: String) async throws {
    guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AppServiceError.notConfigured("Enter an email address first.")
    }
    guard !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw AppServiceError.notConfigured("Enter the OTP code from email.")
    }
    #if DEBUG
    // Development-only stub: accept the login button path so the app can move
    // into the capture flow before the real auth integration exists.
    return
    #else
    throw AppServiceError.notConfigured("Supabase auth is not wired yet.")
    #endif
  }

  func uploadCurrentBatch() async throws {
    #if DEBUG
    // Keep the upload call present for later wiring, but do not block the
    // camera/dev flow while we are only testing the native app shell.
    return
    #else
    throw AppServiceError.notConfigured("Upload is not wired yet.")
    #endif
  }
}
