# eBay Photo App

PWA-first eBay photo app for mobile capture and desktop management.

## Current state

- Phase 0 camera spike is implemented
- The app is split into a mobile capture surface and a desktop management shell with fixed Capture, Queue, and Tools panels
- Supabase project is linked and seeded
- The workspace includes Supabase session bootstrap and a batch upload path for one shared account
- The workspace includes a desktop store/batch/item queue with item detail and manual checkoff for the same shared account
- The workspace shows photo retention dates and supports remote cleanup for listed items
- The desktop shell now uses a compact workspace status strip plus lifecycle chips instead of repeating upload/cleanup summaries in multiple panels
- The mobile shell now uses the same compact status language on the home and camera screens without adding scroll

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

- [`docs/SUPABASE_SETUP.md`](/Users/joe/Projects/ebay-photo-app/docs/SUPABASE_SETUP.md)
- [`.env.example`](/Users/joe/Projects/ebay-photo-app/.env.example)

The app uses Supabase Auth magic-link login and syncs captured item packets into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
The same account is intended for both phone capture and desktop management.
On mobile, the app opens on a capture home screen with a single `Open Camera` action.
The camera mounts only after the user chooses to open it, and the browser remembers an accepted camera permission so later visits can resume faster.
On desktop, the app opens to a queue-first management layout and can scroll naturally where needed.
The app also remembers the last desktop tab and the selected store/batch in the browser.
The mobile capture flow keeps the live preview visible while SKU, weight, and dimensions are edited in an overlay.
`Next` advances to the next item in the same capture session, while `Done` ends capture for now without adding the final submit step yet.
