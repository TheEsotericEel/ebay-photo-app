> [!WARNING]
> Historical / superseded planning document.
>
> This file is preserved for context only. It is not current implementation authority.
>
> Current authority starts with:
>
> 1. `README.md`
> 2. `docs/ARCHITECTURE_SNAPSHOT.md`
> 3. `docs/FEATURE_SCOPE_LEDGER.md`
> 4. `docs/SUPABASE_SSOT.md`
> 5. `docs/BACKEND_CONTRACT_V1.md`
> 6. `docs/CROSS_PLATFORM_SYNC_CONTRACT.md`
> 7. `docs/WORKSPACE_PHASE1.md`
>
> Do not use this document to override current code, migrations, or active docs.

# Capture and Management Notes

This note captures an earlier camera spike and handoff workflow.
The implementation described here was split into a mobile capture screen that opened the camera on demand and a desktop management shell that opened on Queue and could scroll naturally where needed.
Once the user accepted camera access, the app remembered it in the browser and could resume the camera without forcing another prompt.
The app also remembered the last desktop tab and the selected store and batch.
The mobile capture flow kept the live preview on screen while SKU, weight, and dimensions were edited in an overlay.

> Historical note: the old browser-session/Phase 1 runtime surface has been retired. Keep this file as planning context only; it is not implementation authority.

## Mobile direction update

The current mobile product direction is now:

- mobile is the iPhone app
- the iPhone app is a capture + lightweight queue tool
- it should use a real local multi-item queue
- `Next / Finish Item` is the official item boundary checkpoint
- `Queue & Continue` finalizes the current draft into a queued item packet
- if the current draft has captured photos, `Done` routes through the same checkpoint so the user can choose `Queue & Exit` or return to camera
- `Submit` is the deliberate upload/handoff action in MVP for finalized queued item packets
- store is an item-level property, so one local queue may contain items for multiple stores
- exact backend batch mapping remains intentionally deferred

Some Phase 1 implementation language in this repo still reflects older browser-session wording. Treat this note as historical slice context, not current authority.

## Added in this repo

- store and batch records in IndexedDB
- mobile capture surface with upload/cleanup status
- mobile camera overlay for SKU, weight, and dimensions
- desktop tabbed shell with batch drilldown, item detail, and upload tools
- Supabase Auth bootstrap (email OTP default)
- sync into Supabase tables and private storage
- single shared account across capture and lister devices in the historical slice
- retention dates and remote cleanup for listed items
- a compact workspace status strip for camera, auth, sync, cleanup, and workspace selection
- lifecycle chips on queue items and item detail so capture, upload, and cleanup state are visible without extra scrolling
- a matching compact status strip on mobile home and camera screens
- item listing status controls
- default store and batch seed data

## Still to build

- stronger remote verification and safe-to-clear logic for unusual edge cases
- remote photo retention dates for more batch states beyond listed items
- richer remote cleanup automation for scheduled deletion
