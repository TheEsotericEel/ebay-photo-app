# Google OAuth Plan

This document is a planning artifact only. It does not change app behavior.

## 1. Target auth model

- Primary app login: Sign in with Google
- Fallback app login: email + password
- Removed from product auth: OTP / magic-code auth
- Separate future service: linked eBay seller accounts, not app login

## 2. Supabase setup checklist

- Enable the Google provider in Supabase Auth.
- Create or reuse a Google Cloud / Auth Platform project.
- Create OAuth client credentials for the app.
- Store the Google OAuth client ID and client secret in Supabase.
- Request the minimum required scopes:
  - `openid`
  - `email`
  - `profile`
- Add the Supabase callback URL to the Google OAuth client configuration.
- Add local development redirect URLs for desktop and iOS testing.
- Add production redirect URLs for the deployed desktop app and the shipped iOS app.

## 3. Desktop web plan

- Implemented in this repo slice:
  - Keep the existing Supabase JS client.
  - Add a `signInWithGoogle` helper to `useSupabaseSession`.
  - Add a `Continue with Google` button to the desktop auth card.
  - Keep the email + password form below the Google button.
  - Keep OTP out of the UI.
- Still required outside the repo:
  - Enable and configure the Google provider in Supabase.
  - Confirm redirect and callback handling for local development.
  - Confirm redirect and callback handling for the deployed desktop URL.
- Runtime note:
  - If the Google provider is not configured in Supabase, the button should fail generically rather than pretending to succeed.

## 4. iOS plan

- Decide the app URL scheme or deep link path used for OAuth callbacks.
- Document required `Info.plist` changes for the URL scheme.
- Document the Supabase redirect allow-list entry for the iOS callback URL.
- Add a `signInWithGoogle` method to `SupabaseService` later in the iOS slice.
- Decide whether the current custom REST auth client is sufficient for OAuth or whether introducing the Supabase Swift client is cleaner for this flow.
- Preserve existing email + password sign-in.
- Preserve existing DEBUG launch routes.

## 5. Security and account notes

- Google OAuth is app login only.
- eBay OAuth comes later as a linked seller account, not as app login.
- Do not store Google provider tokens unless a later Google API feature requires them.
- The app account remains the Supabase user/workspace identity.

## 6. Implementation sequence

Recommended order:

1. Desktop Google sign-in button and callback handling.
2. iOS redirect and deep-link configuration.
3. iOS Google sign-in button and callback handling.
4. Account menu and profile display after Google sign-in is stable.

## 7. Verification checklist

- Desktop email + password still works.
- Desktop Google login works locally.
- Desktop session restores after refresh.
- iOS email + password still works.
- iOS Google login returns to the app.
- Clean iOS launch still opens `AuthView` when signed out.
- DEBUG routes still work.

## 8. Current implementation status

- Desktop Google OAuth button and helper: implemented.
- Supabase/Google provider configuration: still required outside the repo.
- iOS Google OAuth: future work only.
- Verified desktop runtime on 2026-05-27:
  - The button sends the browser to `https://wchoxagxpsejwrotvnsx.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2F127.0.0.1%3A4173`.
  - Supabase returned `400` with `Unsupported provider: provider is not enabled`.
  - This means the desktop code is wired correctly, but the Google provider is not enabled in the Supabase Auth dashboard for this project yet.
  - The exact dashboard-side unblocker is to enable the Google provider in Supabase Auth and finish the Google OAuth client configuration there.
- Verified desktop runtime on 2026-05-28:
  - The button now redirects to the Google sign-in page with the provided client ID.
  - Desktop password sign-in still restores the local workspace without the IndexedDB object-store error.
  - Full Google account completion was not exercised in this run because a credentialed Google login was not entered.
  - OAuth callback hashes are now scrubbed from the visible URL after Supabase restores the session.
  - A `manifest.json` 401 on a protected Vercel preview is expected and separate from OAuth/session handling.
