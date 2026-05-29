# iOS Google OAuth Plan

This document started as a planning artifact. Native Google Sign-In now exists in the app, with Supabase still acting as the session authority. The browser-based Supabase OAuth path remains in code only as a fallback.

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
- `Info.plist` currently has Supabase config keys plus Google client-ID wiring and the Google callback URL scheme.
- `AppDelegate` now handles Google callback URLs and returns non-Google URLs to SwiftUI `.onOpenURL` for the legacy Supabase callback flow.
- Slice 1 scaffolding implemented on 2026-05-28:
  - GoogleSignIn-iOS package references were added to the Xcode project.
  - `GIDClientID` and `GIDServerClientID` build-setting plumbing was added.
- Native bridge implemented on 2026-05-29:
  - The visible `Continue with Google` button uses native GoogleSignIn-iOS and exchanges the Google ID token with Supabase.
  - The older browser-session Supabase OAuth path remains in code as a fallback method.

## 2. Recommended OAuth approach

Recommended path:
- Keep Supabase as the final session authority.
- Add native Google Sign-In as a bridge that produces Google tokens for Supabase session creation.
- Keep `SupabaseService` as the app-facing source of truth for account state and workspace requests.
- Preserve the existing browser-based OAuth path only as a fallback/recovery path.

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
- Add both `ebayphotoapp://auth-callback` and `ebayphotoapp://auth-callback/` to the Supabase redirect allow-list.
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

1. Add native Google Sign-In package and config scaffolding. Done.
2. Add the iOS callback handling and token exchange bridge.
3. Route the Google button through the native flow.
4. Verify session restore and sign-out cleanup.
5. Keep DEBUG routes and dev bypass behavior unchanged.

## 9. Verification checklist

- Clean iOS launch still opens `AuthView` when signed out.
- Email/password sign-in still works.
- Email/password account creation still works.
- Google OAuth returns to the app through the native bridge.
- The session survives relaunch.
- Sign-out clears the session and provider state.
- Google sign-out clears local Google provider state without revoking the remote grant.
- DEBUG routes still compile and run.
- Dated manual verification: 2026-05-28
  - This file now reflects the current scaffolding-only state rather than claiming the native bridge is complete.

## 10. Debugging Redirects

- Added DEBUG-only diagnostics to `signInWithGoogleBrowserFallback` to print:
  - Intended redirect target URL.
  - Whether `redirect_to` is present in the `signInURL` and its value.
  - Generated OAuth URL host.
- Confirmed `ASWebAuthenticationSession` uses `oauthCallbackScheme` which evaluates to `ebayphotoapp`.
- Added a DEBUG guard before opening Google:
  - If the DEBUG guard trips, the problem is iOS URL generation.
  - If the DEBUG guard passes but the app still opens Vercel/PWA, the problem is Supabase hosted redirect allow-list/config fallback.

## 11. Manual Device Test Required

The OAuth issue must be manually tested on a physical device. Simulator tests verify the code structure, but physical device tests verify the actual web browser redirect routing and Supabase integration.

When running the physical device test, please paste ONLY the following sanitized diagnostic lines from the Xcode console:
- `Supabase OAuth intended redirect target:`
- `Generated OAuth URL host:`
- `Generated OAuth URL contains redirect_to:`
- `Decoded redirect_to equals ebayphotoapp://auth-callback:`

Do not paste full URLs, query strings, callback URLs, auth codes, or tokens.
