# Implementation Decisions

**Status:** locked implementation assumptions for the native iOS migration  
**Date:** 2026-05-19  
**Purpose:** resolve the remaining product/technical gaps so implementation starts with stable defaults.

## Decisions

- **Auth:** Supabase email OTP code entry is the MVP default for both iOS and web. Magic-link/deep-link auth may be added later, but it is not required for the first native slice.
- **Local iOS storage:** captured image files live in the iOS app's Application Support directory. Metadata/state lives in SQLite. SwiftData is not the default storage model for the first native slice.
- **Storage path:** new uploads use an owner-scoped path:
  - `{owner_id}/stores/{store_id}/batches/{batch_id}/items/{item_id}/photos/{photo_id}/{variant}`
  - the desktop app and migration code should tolerate legacy paths during transition.
- **Photo variants:** `original` and `listing` are required for MVP. `thumbnail` is strongly recommended and should be generated when feasible, but the app must tolerate missing thumbnails.
- **Web previews:** the desktop web app should use private Supabase storage with signed URLs or authenticated downloads. Signed URLs are preferred for queue and detail views.
- **Browser fallback:** PWA/browser camera remains fallback and diagnostic only. It is not the primary production capture path.
- **MVP operating shape:** iPhone only, portrait first, single account, one active store and batch at a time, manual foreground upload only.

## First Native Slice

The first useful native slice should prove only this loop:

1. sign in
2. choose default store/batch
3. open camera
4. capture
5. next item
6. local persistence
7. upload
8. desktop visibility

Anything beyond that stays deferred until the capture-to-desktop handoff is proven.
