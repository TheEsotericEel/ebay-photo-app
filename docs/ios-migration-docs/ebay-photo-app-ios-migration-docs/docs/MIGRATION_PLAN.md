# Migration Plan: Native iPhone Capture + Web Desktop Queue

**Project:** eBay Photo App  
**Status:** implementation sequence for migration  
**Goal:** move production capture from Safari/PWA to native iPhone while preserving web desktop management and Supabase backend work

---

## 1. Migration Strategy

The migration should be incremental.

Do not stop useful development to perform a full rewrite. Do not start iPhone work before the shared data contract is stable enough that both clients can interoperate.

Core strategy:

```txt
Fix lifecycle contract
→ make desktop web remote-data-ready
→ build native iPhone capture + local queue client
→ prove end-to-end handoff
→ retire PWA camera as primary path
```

### 1.1 Locked Assumptions

The migration now assumes:

- Supabase email OTP is the default auth flow for MVP
- password sign-in may exist as a development fallback for rate-limit recovery, but it is not the primary product auth flow
- native iPhone local metadata uses SQLite plus Application Support files
- new uploads use the V1 path from `docs/BACKEND_CONTRACT_V1.md`
- `listing` and `thumbnail` are required variants in V1; `original` upload is deferred
- MVP uses one shared account and shared backend records/tables
- browser/PWA camera stays fallback and diagnostic only
- the iPhone app uses a real local multi-item queue
- `Next / Finish Item` is the item boundary checkpoint
- `Queue & Continue` finalizes the current draft into a queued item packet
- if the current draft has captured photos, `Done` routes through the same checkpoint so the user can choose `Queue & Exit` or return to camera
- `Submit` is the deliberate MVP handoff action for finalized queued item packets
- exact backend batch mapping remains deferred

---

## 2. Current Risks to Address First

### 2.1 Remote Cleanup ID Bug

Risk:

- variants not found
- remote photo rows not marked deleted
- storage objects not removed
- false cleanup success

Required fix:

```txt
Use photo.remoteId for remote Supabase operations.
Use photo.id only for local state updates.
```

### 2.2 Local Cleanup Deletes Metadata

Risk:

- item still references missing photo IDs
- desktop/local queue loses state
- remote cleanup cannot reason about deleted local records
- remote IDs are lost

Required fix:

```txt
Clear local blobs/files only.
Preserve photo metadata and remote IDs.
Set localStatus = cleared.
```

### 2.3 Desktop Local-State Dependency

Risk:

- iPhone-submitted items do not appear on desktop unless web reads Supabase

Required fix:

```txt
Add remote workspace adapter for desktop queue.
```

---

## 3. Phase 0 — Lock Docs and Contract

### Goal

Make the migration direction explicit and prevent AI/code agents from drifting back to PWA-first assumptions.

### Acceptance Criteria

- Docs are committed to repo
- Docs clearly state native iPhone capture is the production path
- Docs clearly state web desktop is the management path
- Docs clearly state Supabase is the shared backend
- Docs clearly state mobile queue semantics:
  - local multi-item queue
  - `Next` as item boundary
  - deliberate submit/upload
  - multi-store item-level assignment
  - deferred backend batch mapping

---

## 4. Phase 1 — Fix Existing Lifecycle Bugs

### Goal

Make current web/Supabase lifecycle safe enough to become the shared contract.

### Tasks

1. Fix remote cleanup ID mapping.
2. Fix local cleanup so metadata survives.
3. Keep retention behavior simple and accurate.
4. Add tests covering remote/local ID separation and metadata-preserving cleanup.

### Acceptance Criteria

- `npm test` passes
- `npm run build` passes
- upload/cleanup tests prove local and remote IDs can differ
- local cleanup no longer destroys metadata

---

## 5. Phase 2 — Stabilize Supabase Schema and Policies

### Goal

Make the backend contract explicit and enforceable before the iPhone app writes data.

### Tasks

- verify existing migrations against `docs/BACKEND_CONTRACT_V1.md` for current V1 implementation
- keep `BACKEND_CONTRACT.md` as future-safe reference only
- confirm RLS and storage privacy
- confirm required linkage and uniqueness rules
- explicitly defer owner-scoped storage/schema migration unless scheduled as separate backend work

### Acceptance Criteria

- Supabase migrations match backend contract
- authenticated access works without service-role use in clients
- existing web sync still works after schema/policy changes

---

## 6. Phase 3 — Make Desktop Web Remote-Data-Ready

### Goal

Allow desktop queue to show items submitted by the iPhone app.

### Tasks

- add remote workspace adapter
- load stores/batches/items/photos/variants from Supabase
- use signed URLs or authenticated downloads for photo display
- ensure listing status, retention, and cleanup write to Supabase

### Acceptance Criteria

- desktop queue can render data from Supabase without local browser capture data
- desktop item detail can show remote photo variants
- remote cleanup is blocked until retention expiry

---

## 7. Phase 4 — Create Native iPhone App Skeleton

### Goal

Create the smallest native iPhone app that can authenticate and reach Supabase.

### Tasks

- add `/ios` project to same repo
- add Supabase Swift dependency
- add app config for Supabase URL and anon key
- add auth screen
- implement Supabase email OTP sign-in
- add session persistence
- add sign out
- add minimal home screen showing signed-in state

---

## 8. Phase 5 — Build the Local Queue Capture Loop

### Goal

Prove the iPhone-local product model before optimizing polish.

### Tasks

- build native camera capture
- represent the current working item as an item packet
- implement `Next` as the item boundary
- persist a real local multi-item queue
- support optional metadata
- support review/edit/retake before submit
- preserve per-item store assignment

### Acceptance Criteria

- user can capture multiple items into one queue
- each item can have its own photo count and metadata
- queue survives app close/reopen
- review/edit/retake works before submit

---

## 9. Phase 6 — Submit / Upload Handoff

### Goal

Safely hand iPhone-captured work to the shared backend and desktop.

### Tasks

- submit only eligible unsubmitted item packets
- preserve remote IDs after first successful submit
- retry failed submits without duplication
- keep local files until safety conditions are confirmed

### Acceptance Criteria

- desktop can see submitted work
- later submit actions do not duplicate successful work
- failed work stays local and retryable

---

## 10. Explicit Defers

Do not force decisions on these yet:

- exact `Done` behavior
- exact queue preview UI
- exact metadata field set
- exact upload confirmation standard
- exact backend batch mapping
- reorder / move-between-items scope
