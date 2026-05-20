# Supabase Auth Rate Limits (Dev Unblock)

When the app shows `429 over_email_send_rate_limit` / `email rate limit exceeded`, Supabase is blocking **another outbound auth email** for the project. This is separate from URL/config bugs.

Official reference: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

## What triggers the limit

These endpoints **send email** and share the built-in SMTP quota (very low per hour; only raised with custom SMTP):

- `POST /auth/v1/signup` (confirmation email when confirm-email is enabled)
- `POST /auth/v1/otp`
- `POST /auth/v1/recover`

These **do not send email**:

- `POST /auth/v1/token?grant_type=password` (password sign-in)

## Fastest unblock (recommended)

1. In Supabase Dashboard → **Authentication → Users → Add user**
   - Set email + password
   - Enable **Auto Confirm User**
2. In the iOS app, use **Sign In with Password** only (not OTP, not Create Password Account).
3. Run **Upload Debug Fixture** to validate upload/storage/DB.

## Dashboard settings that help dev

1. **Authentication → Providers → Email**
   - Turn off **Confirm email** so signup does not require a confirmation email (dev only).
2. **Authentication → Rate Limits**
   - Increase OTP-related limits if you still need OTP during dev.
   - Email-send limits for built-in SMTP cannot be raised much without custom SMTP.
3. **Project Settings → Auth → SMTP**
   - Add custom SMTP to lift the built-in email cap.

## CLI / API bypass (no client email send)

Create a confirmed user with the service role (local env only; never commit keys):

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export DEV_EMAIL="you@example.com"
export DEV_PASSWORD="choose-a-strong-password"

./scripts/supabase-dev-create-user.sh
```

Then sign in in the app with **Sign In with Password**.

## Simulator-only upload without auth

In `ios/EbayPhotoApp/Config/Secrets.xcconfig` (DEBUG):

```
DEVELOPMENT_AUTH_BYPASS = YES
```

Rebuild. This skips auth for local upload/UI testing only. Keep `NO` for real auth testing.

## Increase limits via Management API

Requires a Supabase personal access token from [Account Tokens](https://supabase.com/dashboard/account/tokens):

```bash
export SUPABASE_ACCESS_TOKEN="<token>"
export PROJECT_REF="<project-ref>"

curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rate_limit_otp": 30,
    "rate_limit_email_sent": 30
  }'
```

Note: `rate_limit_email_sent` mainly helps with custom SMTP; built-in SMTP per-hour cap is still restrictive per Supabase docs.
