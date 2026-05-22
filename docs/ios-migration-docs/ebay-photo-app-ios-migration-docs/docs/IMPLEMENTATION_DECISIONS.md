# Implementation Decisions

**Status:** product decisions plus implementation defaults for the native iOS migration  
**Date:** 05/21/2026  
**Purpose:** resolve the remaining product/technical gaps so implementation starts with stable defaults without over-locking deferred details.

## Locked Product Decisions

- **Auth:** Supabase email OTP code entry is the MVP default for both iOS and web.
- **Storage path contract:** V1 uses `docs/BACKEND_CONTRACT_V1.md` path:
  - `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}`
- **Photo variants:** V1 requires `listing` + `thumbnail`; `original` upload is deferred.
- **Web previews:** the desktop web app should use private Supabase storage with signed URLs or authenticated downloads. Signed URLs are preferred for queue and detail views.
- **Browser fallback:** PWA/browser camera remains fallback and diagnostic only. It is not the primary production capture path.
- **MVP operating shape:** iPhone only, portrait first, single account, manual foreground submit/upload only.
- **Mobile queue shape:** the iPhone app uses a real local multi-item queue built around item packets.
- **Item boundary:** `Next` is the official item boundary.
- **Store assignment:** store is a property of each item packet, not only of the whole local queue.

## Current Implementation Defaults (Pending Confirmation)

These are practical defaults for the first slice, not long-term architecture commitments:

- **Local iOS storage:** captured image files in Application Support plus SQLite metadata/state.
- **Owner-scoped schema/path migration:** deferred unless explicitly scheduled as backend schema work.

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
