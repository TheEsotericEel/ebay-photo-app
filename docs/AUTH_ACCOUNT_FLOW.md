# Auth Account Flow

## Current target app auth

- App login is email + password for now.
- Google OAuth is documented in [docs/GOOGLE_OAUTH_PLAN.md](./GOOGLE_OAUTH_PLAN.md) and implemented on desktop and iOS.
- The iOS callback/session implementation details are documented in [docs/IOS_GOOGLE_OAUTH_PLAN.md](./IOS_GOOGLE_OAUTH_PLAN.md).
- The iOS app now includes the callback URL scheme, safe URL reception, and real Google sign-in flow.
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
- Desktop account state now shows the signed-in email, current provider, and linked providers; in DEV it also shows the Supabase user ID for identity-linking checks.
- Last used email and login method are remembered locally for convenience. Passwords and access tokens are not stored by the app.
- OTP methods may remain in service code temporarily if they are unused by the product UI.
