# Backend Contract V1: Native iOS Submit + Desktop Import

Last updated: 05/21/2026

## Scope

This V1 contract defines the smallest reliable handoff between:

- **Capture client:** native iOS app
- **Queue/listing client:** desktop web app
- **Shared backend:** Supabase (Postgres + Storage)

This is a contract/spec document only. It does not change code or schema.

## Core decisions

- Native iOS is the primary capture/submit client.
- Desktop web remains local IndexedDB-driven for queue/listing/checkoff.
- Desktop should **import remote rows into local IndexedDB** (bridge), not rewrite queue UI to remote-first in V1.
- Required image variants for MVP: **`listing` + `thumbnail`**.
- `original` variant is deferred.
- Supabase email OTP code entry is the MVP auth default.
- Password sign-in may be used as a development fallback for email rate-limit recovery, but it is not the primary product auth flow.
- Storage bucket: **`photo-assets`**.
- Storage path format:
  - `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}`
- MVP uses one shared account and shared backend records/tables.
- Owner-scoped records and stricter multi-user RLS are deferred future hardening.
- Table graph:
  - `stores -> batches -> items -> photos -> photo_variants`
- `upload_jobs` is deferred for V1.
- Native should write **`uploaded`** status unless it performs true verification.
- Retention fields stay `null` until item is listed.

Important terminology note:

- On the iPhone app, the user-facing concept is a local capture workflow / queue made of item packets.
- The exact mapping from that local queue to backend `batches` remains intentionally deferred.
- This document only defines the minimum remote shape once an item packet is submitted.

---

## 1) NativeSubmitItemPacketV1 shape

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
    listedAt?: string // optional; null/omitted for normal capture flow
  }
  photos: Array<{
    localPhotoId: string // client-local id for mapping/debug
    orderIndex: number
    capturedAt: string
    listing: {
      bytes: ArrayBuffer | Blob
      mimeType: string // usually image/jpeg
      width?: number
      height?: number
    }
    thumbnail: {
      bytes: ArrayBuffer | Blob
      mimeType: string // usually image/jpeg
      width?: number
      height?: number
    }
  }>
}
```

Notes:

- `photos` must be in stable item order (`orderIndex` ascending).
- `listedAt` is optional in V1; normal capture flow should leave item as `new`.
- Each item packet may belong to a different store than the previous item in the same local mobile queue.

## 1.5 Source of Truth

Use this rule for V1 and future extensions unless a document explicitly says otherwise:

- Supabase is the source of truth for shared, durable, cross-device workflow data.
- Supabase Storage is the source of truth for uploaded photo objects.
- IndexedDB is the local execution layer: it may temporarily own in-progress capture queues, unsynced edits, cached remote records, local photo blobs, sync cursors, and offline retry state.
- React state is transient UI state only.

Practical rule:

- Before submit or flush, local queue or local edit state can be authoritative for that device.
- After submit or flush, Supabase records and Storage objects are the canonical shared state for any other device or client.
- Local copies may remain as cache, retry state, or retained working copies, but they are not the cross-device source of truth.

---

## 2) Required table inserts/updates

For one submitted item packet:

1. Resolve/create `stores` by `short_code`.
2. Resolve/create `batches` by `(store_id, name)`.
3. Upsert `items` by `(batch_id, sequence)`.
4. Insert/upsert one `photos` row per image.
5. Insert/upsert two `photo_variants` rows per photo (`listing`, `thumbnail`).
6. Update `items.main_photo_id` to first photo's remote id.
7. Optionally update `batches.item_count` and `batches.photo_count` after item commit.

V1 can use row-level upserts where useful, but should avoid creating orphaned photos/variants.

---

## 3) Required storage uploads

Required uploads per photo:

- `listing` variant
- `thumbnail` variant

Bucket and key:

- bucket: `photo-assets`
- keys:
  - `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/listing`
  - `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/thumbnail`

No `original` upload in V1.

---

## 4) Required vs optional metadata

### Required for remote compatibility

- `stores.short_code`, `stores.name`
- `batches.store_id`, `batches.name`
- `items.store_id`, `items.batch_id`, `items.sequence`, `items.status`
- `photos.store_id`, `photos.batch_id`, `photos.item_id`, `photos.order_index`, `photos.captured_at`
- `photo_variants.photo_id`, `variant_type`, `storage_bucket`, `storage_key`

### Strongly recommended

- `photo_variants.width`, `height`, `bytes`, `mime_type`
- `photos.local_status`, `upload_status`, `remote_status`
- `photos.upload_attempt_count`

### Optional in V1

- `items.sku`, `notes`, `weight`, `dimensions`
- `items.listed_at`
- checksums and advanced diagnostics fields

---

## 5) Status values native writes

### `items.status`

Write one of:

- `new` (default)
- `listed`
- `hold`
- `needs_retake`

For normal capture upload: write `new`.

### `photos.upload_status`

V1 native write pattern:

- pre-upload row: `uploading`
- after successful storage + variant row upsert: `uploaded`
- failure: `failed`

### `photos.remote_status`

V1 native write pattern:

- pre-upload row: `not_uploaded`
- after successful upload commit: `uploaded`
- failure: `failed`

Use `verified` only if native performs explicit verification checks.

---

## 6) Remote-to-local status mapping (desktop import bridge)

Desktop import should map Supabase rows into existing local models (`ItemPacket`, `StoredPhoto`) without changing queue architecture.

### Item mapping

- `items.id` -> `ItemPacket.remoteId`
- `items.sequence` -> `ItemPacket.itemNumber`
- `items.status` -> `ItemPacket.listingStatus`
- derive `ItemPacket.uploadStatus` from child photos:
  - any `failed` -> `failed`
  - all `uploaded|verified|deleted` -> `uploaded` (or `verified` if all verified)
  - otherwise `uploading`/`queued`/`local` based on photo set

### Photo mapping

- `photos.id` -> `StoredPhoto.remoteId`
- `photos.upload_status` -> `StoredPhoto.uploadStatus`
- `photos.remote_status` -> `StoredPhoto.remoteStatus`
- `photos.local_status` -> `StoredPhoto.localStatus`

If local blob is missing (import-only record), keep metadata row and mark local state as non-present according to UI expectations.

---

## 7) Remote IDs desktop must preserve locally

Desktop IndexedDB records must preserve remote IDs for all future sync/cleanup actions:

- store remote id (store mapping key)
- batch remote id (batch mapping key)
- `ItemPacket.remoteId` = `items.id`
- `StoredPhoto.remoteId` = `photos.id`

Cleanup and remote updates must use remote IDs, never local-only ids.

---

## 8) Cleanup/retention compatibility (V1)

- On upload, leave retention fields `null` until listed:
  - `photos.remote_delete_eligible_at = null`
  - `photos.remote_expires_at = null`
  - `items.photo_retention_until = null`
- When desktop marks item `listed`, desktop remains responsible for setting retention-window fields.
- Existing desktop cleanup logic should continue to gate deletion by listing + expiry rules.

---

## 9) Practical implementation sequence

1. Confirm this contract and freeze V1 fields/paths/statuses.
2. Native auth/session (Supabase OTP/session).
3. Native storage upload (`listing`, `thumbnail`).
4. Native DB upserts for `stores/batches/items/photos/photo_variants`.
5. Desktop remote-import bridge:
   - fetch remote rows
   - map into local IndexedDB objects
   - preserve remote IDs
6. Validate queue rendering + status chips + cleanup eligibility on imported items.

---

## 10) Explicit defer list

Defer in V1:

- `original` variant upload requirement
- `upload_jobs` table integration
- owner-scoped schema/RLS rewrite
- multi-user ownership and stricter per-user RLS hardening
- remote-first desktop queue refactor
- schema changes or migration rewrites
- eBay automation and non-upload workflow expansions
- multi-user permissions hardening beyond current authenticated baseline

---

## V1 success definition

V1 is successful when a native-captured item packet is submitted to Supabase and appears in desktop queue/checkoff after import, with correct ordering, thumbnail/listing variants, and compatible statuses/cleanup fields.
