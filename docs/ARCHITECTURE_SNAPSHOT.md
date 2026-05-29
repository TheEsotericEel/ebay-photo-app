# Architecture Snapshot
**Status:** Current implementation authority
**Last updated:** 2026-05-23
**Purpose:** Describe what the app is right now, without migration history, wishlist detail, or superseded planning language.

This document is the short current-state map for the app. It should be read before older planning docs.

For feature timing, planned features, and MVP-vs-future boundaries, see:

- [`docs/FEATURE_SCOPE_LEDGER.md`](FEATURE_SCOPE_LEDGER.md)

For Supabase source-of-truth rules, see:

- [`docs/SUPABASE_SSOT.md`](SUPABASE_SSOT.md)

---

## 1. Product Shape

The app is currently:

```txt
Native iPhone capture app
+ desktop web lister
+ shared Supabase backend
```

The primary workflow is:

1. Capture item photos on iPhone.
2. Keep the camera photo-first.
3. Optionally enter quick metadata during capture.
4. Tap `Next / Finish Item` to open a lightweight checkpoint before queueing.
5. Queue the finalized item packet locally.
6. Review and list items on desktop.
7. Upload finalized queued item packets later from Capture Home.
8. Mark item status on desktop.
9. Clean up local and remote photo copies when safe.

This app is a photo handoff and listing workflow tool, not a full eBay automation platform.

## 1a. iOS Flow Ownership

The canonical native iOS product flow is:

```txt
AuthView -> CaptureHomeView -> CameraSessionView -> ItemDetailsScreen -> QueueReviewSheet
```

That live flow is the source of truth for workflow semantics:

- `Next` finishes the current item and starts the next one.
- `Done` ends the live capture session or batch and moves toward review.
- `Continue to Review` is the pre-review checkpoint transition.
- `Submit` is reserved for the live queue/review upload and handoff path.

`MockIntakeFlowView` and its seeded preview/demo helpers are debug-only:

- They exist for simulator preview, demo, and QA.
- They use seeded local mock state, not product state.
- They should not define or override production workflow semantics.
- Future camera and review work should target the live flow unless the task explicitly says to inspect the mock/debug path.

---

## 2. Platform Roles

### iOS app

The native iOS app owns the capture-first workflow.

Current responsibilities:

- Authenticate with Supabase.
- Native Google sign-in exchanges Google tokens into a Supabase session; Supabase remains the app/session authority.
- Maintain capture context:
  - store
  - store short code
  - batch
  - item number
- Capture photos with the native camera.
- Maintain the current draft item.
- Save local photos and queue state to app storage.
- Keep metadata optional during capture.
- Open a lightweight Finish Item checkpoint before queueing.
- Convert the current draft into a queued item packet only when the user confirms queueing.
- Allow queue review and edit before submit.
- Submit eligible queued item packets to Supabase.
- Mark local photos safe to clear after upload success.
- Allow local cleanup of safe submitted photo copies.

The iOS app may keep local state before `Submit`. Supabase becomes the shared source of truth after `Submit` succeeds.

### Desktop web app

The desktop web app owns the listing and review workflow.

Current responsibilities:

- Authenticate with Supabase.
- Sync workspace stores, batches, items, and photos from Supabase.
- Keep a local IndexedDB working copy and cache.
- Show store-level listing queues.
- Show item cards and item details.
- Display item metadata:
  - SKU
  - weight
  - dimensions
  - notes
- Display ordered item photos.
- Let the lister mark item status:
  - `new` / to list
  - `listed`
  - `hold`
  - `needs retake`
- Queue and flush item metadata and status mutations back to Supabase.
- Provide a manual drag handoff for ordered photos into eBay.

The desktop app is not purely remote-first yet. It uses IndexedDB as a synchronized local working copy.

### Supabase

Supabase owns shared durable state after handoff.

Current responsibilities:

- Auth.
- Workspace provisioning.
- Postgres rows for shared workflow data.
- Storage bucket for uploaded photo assets.
- RLS protection for workspace-owned records.
- Remote photo retention and cleanup state.

---

## 3. Source Of Truth

Before `Submit` or `flush`:

- Device-local state is authoritative for that device.

After `Submit` or `flush`:

- Supabase rows and Storage objects are authoritative shared state.

UI state is transient only.

### iOS local state

Before `Submit`, the iOS app may hold:

- current draft item
- queued items
- queued photos
- local photo files
- submit state
- upload error state
- local remote IDs from previous successful submits

This is valid. The app should not require every capture to immediately hit Supabase.

The current draft is not a remote item yet. It becomes a queued item packet only after the Finish Item checkpoint is confirmed.

### Desktop local state

The desktop app may hold:

- IndexedDB stores
- IndexedDB batches
- IndexedDB items
- IndexedDB photos
- pending item mutations
- sync cursors

This is valid as a local synchronized working copy and cache. It should not contradict Supabase after successful sync.

### Supabase state

After submit or flush, Supabase is the durable shared record.

Supabase is authoritative for:

- workspace-owned stores
- workspace-owned batches
- workspace-owned items
- workspace-owned photos
- workspace-owned photo variants
- remote upload status
- remote cleanup status
- remote retention dates

---

## 4. Current Backend Reality

The backend has moved beyond the original single shared global account model.

Current backend reality:

- Supabase Auth is used.
- Each user is provisioned into a workspace.
- Workspace membership exists.
- Synced business rows are workspace-owned.
- Business tables include `workspace_id`.
- Membership-based RLS exists.
- Parent/child workspace integrity constraints exist.
- Store short codes are scoped by workspace.
- Default workspace, store, and batch provisioning exists.

Current workspace-owned tables include:

- `stores`
- `batches`
- `items`
- `photos`
- `photo_variants`
- `upload_jobs`

The old model where every authenticated user could manage every row is historical and superseded.

---

## 5. Current Data Model

The current shared workflow model is:

```txt
workspace
  store
    batch
      item
        photo
          photo_variant
```

### Store

A store is an organizational queue boundary for the lister.

Current store fields include:

- name
- short code
- workspace ID
- remote/local ID link

Stores are not real eBay store integrations in the current MVP. They organize capture and listing work.

### Batch

A batch groups items under a store.

Current batch fields include:

- name
- status
- upload status
- retention mode
- item count
- photo count
- sync cursor
- pending item mutations

Batches still matter in the backend even though the iOS capture flow feels item-first.

### Item

An item is the core listing unit.

Current item fields include:

- sequence or item number
- listing status
- SKU
- notes
- weight
- dimensions
- listed timestamp
- photo retention date
- main photo ID

### Photo

A photo belongs to an item.

Current photo fields include:

- order index
- upload status
- remote status
- local status
- captured timestamp
- upload attempt count
- retention and cleanup timestamps

### Photo variant

A photo variant points to a stored asset.

Current variant types include:

- listing
- thumbnail
- original

`listing` and `thumbnail` are required for the V1 handoff flow. `original` is optional.
`Submit` / `Upload Batch` operates on finalized queued item packets only; current draft items are not remote items until they are explicitly finalized into the queue.

---

## 6. Current iOS Reality

The native iOS app currently has:

- OTP auth.
- Password fallback.
- Persisted session.
- Capture context persistence.
- Local queue persistence.
- Local photo file persistence.
- Native camera capture.
- Square deliverable output by default.
- Native aspect mode support in code.
- `.5` and `1x` lens modes.
- Auto and locked lens behavior.
- Per-lens zoom persistence.
- Tap focus and exposure support where available.
- Capture loop support for fast repeated capture.
- Metadata tray:
  - SKU
  - weight
  - dimensions
  - notes
- Store and batch context editing.
- Item metadata editing.
- Finish Item checkpoint before queueing.
- `Done` routes through the same checkpoint when the current draft has captured photos.
- Queue review.
- Queue item editing.
- Queue item deletion.
- Queued photo removal.
- Resume queued item in camera.
- Mark submitted item for resubmit.
- Explicit `Submit`.
- Safe local photo cleanup.

The iOS app is the primary mobile capture path.

The old browser/PWA camera path is historical or diagnostic only unless explicitly revived.

---

## 7. Current Desktop Reality

The desktop web app currently renders the desktop lister directly.

Current desktop features include:

- Supabase sign-in.
- OTP default flow.
- Password fallback.
- Local IndexedDB stores, batches, items, and photos.
- Workspace sync.
- Remote workspace import.
- Remote batch delta import.
- Pending item mutation queue.
- Store cards.
- Active batch queue.
- Item cards.
- Item detail modal.
- Ordered photo preview.
- Metadata readout.
- Listing status controls:
  - `new` / to list
  - `listed`
  - `hold`
  - `needs retake`
- Drag ordered photos to eBay image uploader.
- Retention-aware listing status updates.
- Realtime item-change poke plus polling-based import.

The desktop app is a practical listing bridge, not yet a fully polished production workspace manager.

---

## 8. Current Upload And Storage Reality

Current upload behavior:

- iOS submits item packets.
- Desktop can sync and import remote workspace records.
- Web upload code can also sync local batches to Supabase.
- Rows are workspace-owned.
- `listing` and `thumbnail` variants are uploaded.
- `original` may be uploaded when available.
- Photo variants record:
  - bucket
  - storage key
  - width
  - height
  - byte count
  - MIME type

Current storage path shape is still store/batch/item/photo based.

Current path pattern:

```txt
{store-or-store-id}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}
```

Workspace-prefixed storage paths are not current yet.

Important distinction:

- Workspace-owned rows: current.
- Workspace-prefixed storage paths: not current yet.
- Storage RLS and path hardening: still required before public release.

---

## 9. Current Sync Reality

The current sync model is hybrid.

### iOS

The iOS app:

- keeps local queue state before `Submit`
- uploads queued item packets on explicit `Submit`
- polls workspace snapshot after authentication
- applies returned remote store and batch IDs to local context

### Desktop

The desktop app:

- keeps local IndexedDB working state
- pushes local stores and batches to Supabase
- pulls remote stores, batches, items, and photos
- imports remote photo variants when needed
- queues local item mutations
- flushes item mutations to Supabase
- polls periodically
- uses realtime item changes as a refresh trigger

This is not a full conflict-resolution system yet. It is enough for the current single-user workflow.

---

## 10. Current Cleanup Reality

Current cleanup exists, but it is limited.

Current cleanup supports:

- local safe photo copy cleanup after upload and submission state is safe
- retention-based remote photo cleanup
- deletion of eligible remote photo storage objects
- marking photo variants as remotely deleted
- marking photos as remotely deleted
- updating local photo and item cleanup state

Current cleanup does not yet provide a general tombstone-first entity delete model for:

- stores
- batches
- items
- photos as user-visible delete records

Production-safe delete behavior is still a foundation and public-release requirement.

---

## 11. Historical Or Superseded Assumptions

The following are historical and should not be treated as current product direction:

- PWA-first mobile camera.
- Browser camera as the primary production capture path.
- Single shared global account.
- Global authenticated-user access to all rows.
- Owner/workspace/RLS as purely future work.
- Old migration-doc package as active coding authority.
- Old Phase 0 browser-camera docs as current implementation authority.

These docs may still be useful for context, debugging, or feature mining, but not as current source of truth.

---

## 12. Current Known Gaps

Known gaps that should stay visible:

- `BACKEND_CONTRACT_V1.md` needs to stay aligned with workspace reality.
- Storage paths are not workspace-prefixed yet.
- Storage RLS and path hardening are not finished.
- Tombstone-first entity delete is not finished.
- Team roles and invites are not current.
- Billing and entitlements are not current.
- eBay API listing creation is not current.
- Chrome extension and eBay page helper are not current.
- AI listing helper is not current.
- Browser/PWA capture is not the active mobile architecture.

---

## 13. What This Doc Does Not Decide

This doc does not decide:

- exact UI polish priorities
- App Store release checklist
- team and billing model
- eBay API strategy
- AI listing strategy
- Chrome extension implementation
- full sync conflict strategy
- final storage migration plan

Those belong in other docs or future decision records.

---

## 14. Related Docs

Read in this order:

1. `README.md` - repo entrypoint and doc map.
2. `docs/ARCHITECTURE_SNAPSHOT.md` - current implementation shape.
3. `docs/FEATURE_SCOPE_LEDGER.md` - feature status and MVP/future boundaries.
4. `docs/SUPABASE_SSOT.md` - data ownership and source-of-truth rules.
5. `docs/BACKEND_CONTRACT_V1.md` - submit/upload/import contract.
6. `docs/CROSS_PLATFORM_SYNC_CONTRACT.md` - sync ownership and platform responsibilities.
7. `docs/WORKSPACE_PHASE1.md` - implemented workspace/RLS slice record.
8. `docs/SUPABASE_SETUP.md` - Supabase setup reference.
9. `docs/IOS_SIMULATOR_TESTING.md` - iOS simulator/device testing reference.
