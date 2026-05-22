# iOS Simulator Testing

Use the simulator for non-camera-critical work:

- Supabase config validation
- auth flow (password sign-in preferred; OTP optional; sign out, session restore)
- upload service behavior
- storage path and DB row verification
- status/failure handling
- SwiftUI app flow/layout checks

Use a physical iPhone for camera-critical work:

- real capture quality
- lens switching behavior
- focus and exposure behavior
- capture speed and responsiveness
- close-up sharpness and motion behavior

## Stream unified logs to file

From repo root:

```bash
./scripts/ios-tail-sim-logs.sh com.joesprojects.ebayphotoapp
```

This streams unified logs to terminal and writes:

- `logs/ios-live.log`

Copy recent logs for Cursor/ChatGPT:

```bash
tail -n 300 logs/ios-live.log | pbcopy
```

## Debug fixture upload (simulator-friendly)

The capture home screen includes a DEBUG-only action:

- `Upload Debug Fixture`

Behavior:

- generates 1 item packet with 2 local fixture images
- creates listing and thumbnail variants
- calls the same `SupabaseService.uploadItemPacket(_:)` path as normal capture uploads
- requires a real authenticated session unless development auth bypass is explicitly enabled

This is only a simulator test path. It does not change the intended mobile product model:

- the iPhone app should still be treated as a local multi-item queue
- `Submit` is still the intended deliberate handoff action
- exact batch mapping remains deferred

This lets you validate auth + upload + storage + DB behavior in simulator without relying on physical camera capture.

## Auth rate limits (`429 over_email_send_rate_limit`)

If OTP or account creation fails with email rate limit errors, see:

- `docs/SUPABASE_AUTH_RATE_LIMITS.md`

Quick path: create an auto-confirmed user in Supabase Dashboard, then use **Sign In with Password** (no email sent).

## Physical iPhone logging

- Run from Xcode and inspect the debug console.
- Or use macOS Console app, select the connected iPhone, and filter by subsystem/category.
- If your local Xcode supports `xcrun devicectl` streaming, verify its exact local command before depending on it.
