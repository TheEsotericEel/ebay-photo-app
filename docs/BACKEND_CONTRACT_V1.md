# Backend Contract V1
**Status:** Current backend contract
**Last updated:** 2026-05-23
**Purpose:** Define the current submit, upload, and import contract between native iOS, desktop web, and Supabase.

This document reflects the current workspace-owned backend model. It supersedes older shared-account wording.

---

## 1. Current Backend Model

The backend uses:

- Supabase Auth
- single-user workspace provisioning for MVP
- workspace-owned business rows
- membership RLS
- Supabase Storage for photo assets

Current shared model:

```txt
workspace
  store
    batch
      item
        photo
          photo_variant
```

The old global shared-account and global-row model is historical and must not be reintroduced.

### Current workspace-owned tables

- `stores`
- `batches`
- `items`
- `photos`
- `photo_variants`
- `upload_jobs`

### Current source-of-truth rule

Before `Submit` or `flush`:

- iOS local queue is authoritative for unsubmitted iOS captures.
- Desktop IndexedDB may hold local working state and pending mutations.

After `Submit` or `flush`:

- Supabase rows and Storage objects are authoritative shared state.

---

## 2. Auth

Current auth flows:

- OTP is the default sign-in flow.
- Password is a fallback and development-practical path.
- The iOS app persists session state.
- The desktop web app signs into Supabase.

The MVP assumption is a single user using the same account and workspace across iOS and desktop.

This is not the old global shared-account model.

---

## 3. Workspace Ownership

All synced business records must be workspace-owned.

Rules:

- Do not reintroduce global shared records.
- Do not reintroduce permissive authenticated-user access.
- Preserve `workspace_id` on synced business rows.
- Preserve workspace membership RLS.
- Preserve parent/child workspace integrity.

### Current backend reality

- Supabase Auth is used.
- Each user is provisioned into a workspace.
- Workspace membership exists.
- Synced business rows are workspace-owned.
- Business tables include `workspace_id`.
- Membership-based RLS exists.
- Parent/child workspace integrity constraints exist.
- Store short codes are scoped by workspace.
- Default workspace, store, and batch provisioning exists.

---

## 4. Native iOS Submit Packet

The V1 native submit packet contains:

- store
- batch
- item
- photos
- listing variant
- thumbnail variant
- optional original variant

`listing` and `thumbnail` are required for V1.

`original` is optional and must not be required by desktop V1.

### Packet shape

```ts
type NativeSubmitItemPacketV1 = {
  store: {
    shortCode: string
    name: string
  }
  batch: {
    name: string
    status?: "active" | "ready_for_listing" | "archived"
  }
  item: {
    sequence: number
    status?: "new" | "listed" | "hold" | "needs_retake"
    sku?: string
    notes?: string
    weight?: string
    dimensions?: string
    listedAt?: string
  }
  photos: Array<{
    localPhotoId: string
    orderIndex: number
    capturedAt: string
    listing: {
      bytes: ArrayBuffer | Blob
      mimeType: string
      width?: number
      height?: number
    }
    thumbnail: {
      bytes: ArrayBuffer | Blob
      mimeType: string
      width?: number
      height?: number
    }
    original?: {
      bytes: ArrayBuffer | Blob
      mimeType: string
      width?: number
      height?: number
    }
  }>
}
```

---

## 5. Submit Behavior

Submit should:

1. resolve or provision workspace
2. upsert store
3. upsert batch
4. upsert item
5. upsert photo rows
6. upload `listing` and `thumbnail` storage objects
7. optionally upload `original`
8. upsert photo variants
9. finalize photo upload state
10. update item main photo
11. update batch counts and status

Submit is explicit. The current model does not require every capture to upload immediately.

---

## 6. Desktop Import And Sync

Desktop may:

- keep IndexedDB as a synchronized working copy and cache
- push local stores and batches
- pull remote stores, batches, items, and photos
- import photo variants
- queue item mutations
- flush mutations to Supabase

Desktop is not required to be purely remote-first in V1.

Desktop item mutations may include:

- listing status
- listed date
- retention dates
- SKU
- notes
- weight
- dimensions

---

## 7. Storage Behavior

Current storage path shape is still store, batch, item, and photo based:

```txt
{store-or-store-id}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}
```

Rows are workspace-owned, but storage paths are not fully workspace-prefixed yet.

Workspace-prefixed storage paths and stricter storage path and RLS hardening are required before public release.

Do not document the current storage path shape as the final public-release security model.

---

## 8. Photo Variants

Current variant behavior:

- `listing` is required.
- `thumbnail` is required.
- `original` is optional.

The desktop V1 flow must work from listing-quality local or imported blobs and thumbnails. It must not require original assets.

---

## 9. Cleanup And Delete Behavior

Current:

- local safe cleanup exists
- retention-based remote photo cleanup exists
- eligible remote photo assets may be deleted
- photo rows and variants are marked with remote deletion state

Not current yet:

- tombstone-first entity delete for stores, batches, items, and photos
- production-safe delete lifecycle for all entities

Before public release, storage hardening and delete behavior need explicit review.

---

## 10. Explicitly Superseded Assumptions

Do not use these assumptions:

- one global shared account as the backend model
- global authenticated-user access to rows
- owner/workspace/RLS as purely future work
- PWA/browser camera as the primary mobile submit path
- `original` variant as required for V1
- desktop as already fully remote-first

If historical references to those assumptions remain elsewhere, they must be under a clear historical or superseded warning.
