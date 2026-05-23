# eBay Photo App

Cross-platform eBay photo workflow with a native iPhone capture app, a desktop listing site, and a shared Supabase backend.

## Current state

- The repo contains both the desktop site and the native iPhone app.
- The desktop site is the listing and workspace management surface.
- The iPhone app is being aligned to a capture-first, lightweight local queue workflow.
- Supabase is linked and seeded for shared auth, remote records, and storage.
- The workspace includes desktop store/batch/item queue functionality, item detail, and manual checkoff for one shared account.
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

The app uses Supabase Auth and syncs item/photo handoff data into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
The same account is intended for both phone capture and desktop management.

### Current mobile direction

- `mobile` means the native iPhone app.
- The iPhone app is a capture + lightweight queue tool, not the final listing workspace.
- The iPhone app should keep a real local multi-item capture queue.
- `Next` is the official item boundary.
- `Submit` is the deliberate MVP handoff/upload action.
- Store assignment is an item-level property, so one local queue may contain items for multiple stores.
- Photos stay app-local until upload/retention decisions are made and should not be saved to the iPhone Camera Roll by default.

### Current desktop direction

- `desktop` means the site / desktop app / PC web app.
- The desktop site remains the review, listing, status, and cleanup surface.
- Backend `batches` still exist as shared remote records, but the exact mapping between the iPhone local queue and backend batches remains intentionally deferred.
