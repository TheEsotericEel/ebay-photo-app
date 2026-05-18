# eBay Photo App

PWA-first eBay photo handoff app for camera capture, item packets, and a lister queue.

## Current state

- Phase 0 camera spike is implemented
- Phase 1 store/batch queue scaffolding is implemented
- Supabase project is linked and seeded
- Phase 1 now includes Supabase session bootstrap and a batch upload path
- Phase 1 now includes a desktop store/batch/item queue with item detail and manual checkoff

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

Phase 1 uses Supabase Auth magic-link login and syncs captured item packets into the remote `stores`, `batches`, `items`, `photos`, and `photo_variants` tables.
