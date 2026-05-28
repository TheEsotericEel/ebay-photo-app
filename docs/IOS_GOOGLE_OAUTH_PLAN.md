# iOS Google OAuth Plan

This document started as a planning artifact. The iOS OAuth foundation has now been implemented in the app, and this file records the remaining setup and verification notes.

## 1. Current iOS auth architecture

- `RootView` owns the visible auth surface in `ios/EbayPhotoApp/Views/RootView.swift`.
- `AuthView` currently handles email/password sign-in and account creation.
- `SupabaseService` is the app's auth and workspace API façade.
- `SupabaseService` currently persists a serialized session model in `UserDefaults` under `ebp.supabase.session.v1`.
- `SupabaseService` already supports:
  - email/password sign-in
  - email/password account creation
  - sign-out
  - cached session restoration
  - authenticated workspace/item requests
- `Info.plist` currently has Supabase config keys and no URL scheme for OAuth callbacks.
- `AppDelegate` currently handles portrait locking only. There is no OAuth URL handling yet.
- Foundation slice implemented on 2026-05-28:
  - `ebayphotoapp://auth-callback` URL scheme added to `Info.plist`.
  - The app receives OAuth callback URLs safely and logs only a generic message.
  - The official Supabase Swift client was added for OAuth initiation and callback/session exchange.
  - `SupabaseService` keeps email/password auth and workspace access as the app-facing façade.
  - `AuthView` now enables `Continue with Google` alongside the existing email/password fallback.

## 2. Recommended OAuth approach

Recommended path:
- Keep the Supabase Swift client in place for iOS OAuth initiation, callback exchange, and session refresh/persistence.
- Keep `SupabaseService` as the app-facing source of truth for account state and workspace requests.
- After OAuth completes, bridge the resulting Supabase session into the existing app state and persistence flow.
- Supabase Swift dependency status:
  - Added in the implementation slice.
  - The callback plumbing and session bridge are now in place.

Why this is the recommended path:
- Native OAuth code exchange and PKCE are easy to get subtly wrong in a custom REST implementation.
- The current app already has a custom session model and workspace API layer, so the cleanest change is to let the OAuth-capable client handle the browser/callback mechanics while preserving the existing app-facing facade.
- This keeps email/password auth working without rewriting the rest of the service layer.

## 3. Callback scheme and deep link

Candidate callback URL:
- `ebayphotoapp://auth-callback`

Planned iOS URL handling:
- Add a custom URL scheme in `Info.plist`.
- Handle the callback in the app delegate or scene layer.
- Forward the callback URL into the OAuth/session handler without logging tokens or full callback parameters.

## 4. Supabase and provider configuration

Required Supabase Auth setup:
- Enable the Google provider.
- Configure the Google OAuth client ID and client secret in Supabase.
- Add `ebayphotoapp://auth-callback` to the Supabase redirect allow-list.
- Add any additional exact redirect URLs only if the implementation later needs them for simulator or development testing.

Required Google / Auth Platform setup:
- Create or reuse the Google Cloud / Auth Platform project.
- Configure the OAuth client for the iOS app flow.
- Keep the requested scopes minimal:
  - `openid`
  - `email`
  - `profile`

## 5. `Info.plist` changes to make later

Add a `CFBundleURLTypes` entry for the custom scheme:
- URL scheme: `ebayphotoapp`
- Callback path: `auth-callback`

Keep the existing Supabase config keys unchanged:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `DEVELOPMENT_AUTH_BYPASS`

## 6. Session and storage notes

- Do not log access tokens, refresh tokens, or raw callback URLs.
- Preserve email/password auth behavior.
- Keep `DEVELOPMENT_AUTH_BYPASS` and the DEBUG launch routes intact.
- Do not persist fake auth state for dev bypass.
- Migrate session persistence away from plain `UserDefaults` before shipping if the OAuth flow still relies on the existing serialized session model.

## 7. Risks to manage

- Native callback handling:
  - The app must receive the custom-scheme redirect reliably.
- Browser handoff:
  - The sign-in flow must return cleanly from the browser to the app.
- Token/session persistence:
  - The callback exchange must hydrate the same session state the app already uses for workspace calls.
- Logging:
  - Avoid printing token-bearing callback URLs in DEBUG or release logs.
- Existing auth:
  - Email/password sign-in and account creation must keep working.

## 8. Suggested implementation sequence

1. Add the iOS URL scheme and callback handling. Done.
2. Add Supabase Swift OAuth/session plumbing behind the existing auth façade. Done.
3. Verify email/password still works. Done.
4. Verify Google sign-in returns to the app and restores the same workspace session. Done.
5. Keep DEBUG routes and dev bypass behavior unchanged. Done.

## 9. Verification checklist

- Clean iOS launch still opens `AuthView` when signed out.
- Email/password sign-in still works.
- Email/password account creation still works.
- Google OAuth returns to the app.
- The session survives relaunch.
- Sign-out clears the session.
- DEBUG routes still compile and run.
- Dated manual verification: 2026-05-28
  - The iOS Google OAuth plumbing is implemented and build/test verified here.
  - The callback path is `ebayphotoapp://auth-callback`.
  - The app is wired to restore the authenticated session and open Capture Home after a successful callback exchange.
  - Build/test verification completed here, but a live credentialed Google account pass on a physical iOS device still needs to be run manually if you want end-to-end human confirmation outside the simulator/build harness.
