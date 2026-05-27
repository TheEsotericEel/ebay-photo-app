# Email + Password Auth Verification

This checklist is for confirming the current app auth path before Google OAuth is added.

## Supabase prerequisites

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured for the app and desktop client.
- Supabase email/password auth is enabled.
- A test user exists, or account creation is enabled for the test project.
- Email confirmation behavior is understood before testing account creation.

## iOS verification

- Clean launch opens `AuthView` when no session is present.
- Invalid email/password shows a clear error.
- Valid email/password signs in and enters the authenticated app flow.
- Create account follows the expected Supabase result path.
- Sign out returns to `AuthView`.
- Relaunch restores the session after a successful sign-in.

## Desktop verification

- Missing config state still appears when Supabase is not configured.
- Invalid email/password shows a clear error.
- Valid email/password enters the desktop lister.
- Refresh restores the session after a successful sign-in.
- Sign out returns to the login card.

## Cross-client verification

- The same email/password works in both iOS and desktop.
- iOS uploads or workspace changes are visible in desktop after sync/import.
- Desktop can see iOS-uploaded data after refresh or workspace sync.

## Notes

- Do not commit real credentials.
- Do not store test passwords in docs.
- DEBUG launch routes are for local testing only and do not prove real auth.
