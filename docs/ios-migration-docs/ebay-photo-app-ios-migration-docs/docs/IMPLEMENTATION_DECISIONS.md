# Implementation Decisions

**Status:** locked implementation assumptions for the native iOS migration  
**Date:** 2026-05-21  
**Purpose:** resolve the remaining product/technical gaps so implementation starts with stable defaults without over-locking deferred details.

## Decisions

- **Auth:** Supabase email OTP code entry is the MVP default for both iOS and web. Magic-link/deep-link auth may be added later, but it is not required for the first native slice.
- **Local iOS storage:** captured image files live in the iOS app's Application Support directory. Metadata/state lives in SQLite. SwiftData is not the default storage model for the first native slice.
- **Storage path:** new uploads use an owner-scoped path:
  - `{owner_id}/stores/{store_id}/batches/{batch_id}/items/{item_id}/photos/{photo_id}/{variant}`
  - the desktop app and migration code should tolerate legacy paths during transition.
- **Photo variants:** `original` and `listing` are required for MVP. `thumbnail` is strongly recommended and should be generated when feasible, but the app must tolerate missing thumbnails.
- **Web previews:** the desktop web app should use private Supabase storage with signed URLs or authenticated downloads. Signed URLs are preferred for queue and detail views.
- **Browser fallback:** PWA/browser camera remains fallback and diagnostic only. It is not the primary production capture path.
- **MVP operating shape:** iPhone only, portrait first, single account, manual foreground submit/upload only.
- **Mobile queue shape:** the iPhone app uses a real local multi-item queue built around item packets.
- **Item boundary:** `Next` is the official item boundary.
- **Store assignment:** store is a property of each item packet, not only of the whole local queue.

## Explicitly Not Locked Yet

These details remain deferred and should not be invented during implementation:

- exact camera screen layout
- exact queue review UI
- exact store-switch UI
- exact metadata fields
- exact `Done` behavior
- exact photo cleanup timing
- exact upload confirmation standard
- exact backend batch mapping
- whether reorder / move-between-items is MVP or later

## First Native Slice

The first useful native slice should prove only this loop:

1. sign in
2. confirm capture context
3. open camera
4. capture
5. `Next`
6. local queue persistence
7. review/edit if needed
8. submit/upload
9. desktop visibility

Anything beyond that stays deferred until the capture-to-desktop handoff is proven.
