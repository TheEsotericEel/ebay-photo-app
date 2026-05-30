# eBay Photo App

Cross-platform eBay photo workflow with a native iPhone capture app, a desktop listing site, and a shared Supabase backend.

## Documentation Authority
Read these docs first:

1. [`README.md`](README.md) - repo entrypoint and doc map.
2. [`docs/ARCHITECTURE_SNAPSHOT.md`](docs/ARCHITECTURE_SNAPSHOT.md) - current app, platform, and backend architecture.
3. [`docs/FEATURE_SCOPE_LEDGER.md`](docs/FEATURE_SCOPE_LEDGER.md) - feature status, MVP boundaries, future features, and agent scope rules.
4. [`docs/SUPABASE_SSOT.md`](docs/SUPABASE_SSOT.md) - source-of-truth and data ownership rules.
5. [`docs/BACKEND_CONTRACT_V1.md`](docs/BACKEND_CONTRACT_V1.md) - current submit, upload, and import backend contract.
6. [`docs/CROSS_PLATFORM_SYNC_CONTRACT.md`](docs/CROSS_PLATFORM_SYNC_CONTRACT.md) - cross-platform sync ownership and field responsibilities.
7. [`docs/WORKSPACE_PHASE1.md`](docs/WORKSPACE_PHASE1.md) - implemented workspace/RLS slice record.

Historical planning docs are preserved for context only. They must not be treated as current implementation authority unless one of the active docs explicitly points to them.

## Current state

- The repo contains both the desktop site and the native iPhone app.
- The desktop site is the listing and workspace management surface.
- The iPhone app is being aligned to a capture-first, lightweight local queue workflow.
- Supabase is linked and seeded for shared auth, remote records, and storage.
- The workspace includes desktop store/batch/item queue functionality, item detail, and manual checkoff for the single-user workspace MVP.
- The workspace shows photo retention dates and supports remote cleanup for listed items.
- The desktop shell uses a compact workspace status strip plus lifecycle chips instead of repeating upload/cleanup summaries in multiple panels.
- The mobile shell is moving toward a local multi-item capture queue that hands work off to desktop through explicit submit/upload.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run build
```

## iOS native logs

The native iOS app emits structured unified logs with subsystem/category:

- subsystem: app bundle id (for example `com.joesprojects.ebayphotoapp`)
- categories: `config`, `auth`, `upload`, `camera`

To stream simulator logs into a Cursor-readable file:

```bash
./scripts/ios-tail-sim-logs.sh com.joesprojects.ebayphotoapp
```

This writes and tails:

- `logs/ios-live.log`

To copy recent logs to clipboard:

```bash
./scripts/ios-copy-last-logs.sh
```

### Physical iPhone logging

- Run from Xcode and use the debug console for live logs.
- Or open macOS Console, select the connected iPhone, and filter by subsystem/category.
- If your local Xcode supports `xcrun devicectl` log streaming, verify the command locally before relying on it.

See `docs/IOS_SIMULATOR_TESTING.md` for simulator-vs-device testing guidance and fixture upload flow.

## Supabase

The repo includes a linked Supabase project and migrations in `supabase/`.
See:

- [`docs/SUPABASE_SSOT.md`](docs/SUPABASE_SSOT.md) — architecture and data-ownership reference (must-read)
- [`docs/PUBLISHABLE_MVP_FOUNDATION.md`](docs/PUBLISHABLE_MVP_FOUNDATION.md) — publishable MVP direction (workspace ownership, RLS, tombstone deletes)
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`.env.example`](.env.example)
- iOS auth note: native Google sign-in uses `GoogleSignIn-iOS`, was manually verified on 2026-05-29, and exchanges into Supabase; the browser OAuth path is fallback only. The nonce split is: raw nonce in-memory, SHA-256 hex to Google, raw nonce to Supabase. See `docs/AUTH_ACCOUNT_FLOW.md`.

The app uses Supabase Auth and syncs item/photo handoff data into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
The same signed-in user/account is used for both phone capture and desktop management in the MVP workspace model.

### Current mobile direction

- `mobile` means the native iPhone app.
- The iPhone app is a capture + lightweight queue tool, not the final listing workspace.
- The iPhone app should keep a real local multi-item capture queue.
- `Next` opens the optional item checkpoint; `Save & Next` is the quick queue/return action.
- `Submit` is the deliberate MVP handoff/upload action.
- Current button semantics live in [`docs/CAPTURE_FLOW_CONTRACT.md`](/Users/joe/Projects/ebay-photo-app/docs/CAPTURE_FLOW_CONTRACT.md).
- Store assignment is an item-level property, so one local queue may contain items for multiple stores.
- Photos stay app-local until upload/retention decisions are made and should not be saved to the iPhone Camera Roll by default.

### Current desktop direction

- `desktop` means the site / desktop app / PC web app.
- The desktop site remains the review, listing, status, and cleanup surface.
- Backend `batches` still exist as shared remote records, but the exact mapping between the iPhone local queue and backend batches remains intentionally deferred.
