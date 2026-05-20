#!/usr/bin/env bash
set -euo pipefail

# Creates (or updates) a confirmed email/password user via Supabase Admin API.
# Does not use client signup/OTP endpoints, so it avoids email-send rate limits.
#
# Required env:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   DEV_EMAIL
#   DEV_PASSWORD
#
# Optional:
#   DEV_DISPLAY_NAME (default: Dev User)

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${DEV_EMAIL:-}" || -z "${DEV_PASSWORD:-}" ]]; then
  echo "Missing required env. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_EMAIL, DEV_PASSWORD." >&2
  exit 1
fi

export DEV_DISPLAY_NAME="${DEV_DISPLAY_NAME:-Dev User}"
base_url="${SUPABASE_URL%/}"

payload="$(python3 - <<'PY'
import json, os
print(json.dumps({
  "email": os.environ["DEV_EMAIL"],
  "password": os.environ["DEV_PASSWORD"],
  "email_confirm": True,
  "user_metadata": {"display_name": os.environ["DEV_DISPLAY_NAME"]},
}))
PY
)"

echo "Creating confirmed user for ${DEV_EMAIL} ..."
response="$(curl -sS -w "\n%{http_code}" -X POST "${base_url}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "${payload}")"

body="$(printf '%s' "$response" | sed '$d')"
status="$(printf '%s' "$response" | tail -n 1)"

if [[ "$status" == "200" || "$status" == "201" ]]; then
  echo "User ready. Sign in with password in the iOS app."
  exit 0
fi

if [[ "$status" == "422" ]] && printf '%s' "$body" | grep -Eiq "already been registered|already exists"; then
  echo "User already exists. Sign in with password in the iOS app."
  exit 0
fi

echo "Admin create user failed (HTTP ${status}):" >&2
printf '%s\n' "$body" >&2
exit 1
