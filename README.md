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

## Supabase

The repo includes a linked Supabase project and migrations in `supabase/`.
See:

- [`docs/SUPABASE_SETUP.md`](/Users/joe/Projects/ebay-photo-app/docs/SUPABASE_SETUP.md)
- [`.env.example`](/Users/joe/Projects/ebay-photo-app/.env.example)

The app uses Supabase Auth magic-link login and syncs captured item packets into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
The same account is intended for both phone capture and desktop management.
On mobile, the app opens on a capture home screen with a single `Open Camera` action.
The camera mounts only after the user chooses to open it, and the browser remembers an accepted camera permission so later visits can resume faster.
On desktop, the app shows a tabbed management layout with fixed panels for Capture, Queue, and Tools instead of a long scrolling page.
The app also remembers the last desktop tab and the selected store/batch in the browser.
