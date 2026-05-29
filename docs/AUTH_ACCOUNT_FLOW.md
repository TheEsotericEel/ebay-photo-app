# Auth Account Flow

## Current target app auth

- App login is email + password for now.
- Google OAuth is documented in [docs/GOOGLE_OAUTH_PLAN.md](./GOOGLE_OAUTH_PLAN.md); desktop is implemented and iOS now uses a native Google Sign-In bridge.
- The iOS callback/session implementation details are documented in [docs/IOS_GOOGLE_OAUTH_PLAN.md](./IOS_GOOGLE_OAUTH_PLAN.md).
- The iOS app now uses native GoogleSignIn-iOS as the primary visible Google login behavior; the browser-session Supabase OAuth path is retained only as a fallback.
- Manual native Google sign-in was verified on 2026-05-29.
- Email/password verification steps live in [docs/EMAIL_PASSWORD_AUTH_VERIFICATION.md](./EMAIL_PASSWORD_AUTH_VERIFICATION.md).
- iOS and desktop use the same Supabase app account and workspace session.

## Removed or deprecated from the product-facing flow

- OTP / magic-code login is no longer part of the visible product auth UI.
- The app should not present email OTP as the default or recommended login path.
- Linked eBay seller accounts are separate future connected services, not the app login itself.

## Development access

- DEBUG launch routes remain available for testing:
  - `-open-capture-home`
  - `-open-live-camera-with-seeded-photo`
  - `-open-mock-intake-flow`
  - `-open-input-lab`
- `DEVELOPMENT_AUTH_BYPASS` may still be used in DEBUG for local testing.
- Dev bypass must not create persisted fake auth state.

## Notes

- iOS remains the account-creation path in the product surface for now.
- Desktop uses password sign-in only until a separate account-creation slice is added.
- Desktop Google OAuth is now implemented in the web auth card, but Supabase and Google provider configuration are still required before it can succeed at runtime.
- iOS Google sign-in uses native GoogleSignIn-iOS and then creates the app session through Supabase.
- Native nonce mapping: generate one raw nonce, send the SHA-256 hex form to GoogleSignIn-iOS, and send the raw nonce to Supabase `signInWithIdToken`.
- Google client secret is configured in Supabase provider settings, not committed to the iOS repo.
- iOS client ID and reversed client ID are public app config values, not secrets.
- `ios/EbayPhotoApp/Config/Secrets.xcconfig` stays local and gitignored.
- Desktop account state now shows the signed-in email, current provider, and linked providers; in DEV it also shows the Supabase user ID for identity-linking checks.
- Last used email and login method are remembered locally for convenience. Passwords and access tokens are not stored by the app.
- OTP methods may remain in service code temporarily if they are unused by the product UI.
