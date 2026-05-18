# eBay Photo App

PWA-first eBay photo handoff app for camera capture, item packets, and a lister queue.

## Current state

- Phase 0 camera spike is implemented
- The workspace is split into a mobile home/camera flow and a desktop queue surface
- Supabase project is linked and seeded
- The workspace includes Supabase session bootstrap and a batch upload path for one shared account
- The workspace includes a desktop store/batch/item queue with item detail and manual checkoff for the same shared account
- The workspace shows photo retention dates and supports remote cleanup for listed items

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

The workspace uses Supabase Auth magic-link login and syncs captured item packets into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
The same account is intended for both phone capture and desktop listing.
On mobile, the app opens on a home screen with a single `Open Camera` action.
The camera mounts only after the user chooses to open it.
On desktop, the app shows the queue-first layout with item detail and cleanup controls.
