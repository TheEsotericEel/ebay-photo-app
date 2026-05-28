# Desktop Auth Hardening

This note captures the current desktop account/session UX after Google OAuth was added.

## What the desktop UI shows

- Signed-in email
- Current provider
- Linked providers
- Sign Out in the main header on authenticated screens
- In DEV, the Supabase user ID for identity-link checks

## Local convenience state

- Last used email is remembered in `localStorage`
- Last used login method is remembered in `localStorage`
- Passwords are not stored
- Access tokens are not stored manually by the app

## Same-email account check

- Email/password and Google should resolve to the same Supabase user when the providers are linked to the same email account.
- The safest way to verify that is to compare the DEV user ID display after signing in with password and after signing in with Google.
- Linked provider labels should show both sources when the account is linked.

## Session behavior

- `getSession()` restores the existing session on reload.
- `onAuthStateChange` updates the session when sign-in or sign-out happens.
- Sign out clears the active session and returns to the login card.

