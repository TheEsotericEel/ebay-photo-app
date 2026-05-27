# Auth Account Flow

## Current target app auth

- App login is email + password for now.
- Google OAuth is planned and documented in [docs/GOOGLE_OAUTH_PLAN.md](./GOOGLE_OAUTH_PLAN.md), but not implemented yet.
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
- OTP methods may remain in service code temporarily if they are unused by the product UI.
