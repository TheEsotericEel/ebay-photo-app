# Backend Contract

**Project:** eBay Photo App  
**Status:** required contract before native iOS migration  
**Backend:** Supabase Auth + Postgres + Storage  
**Primary clients:** native iOS capture app and web desktop management app  
**Audit basis:** current `main` already uses `stores`, `batches`, `items`, `photos`, `photo_variants`, `upload_jobs`, and `photo-assets` storage concepts.

---

## 1. Purpose

This document defines the shared contract that both clients must obey.

The native iOS app and web desktop app must be able to evolve independently. That is only safe if they agree on:

- IDs
- table ownership
- storage paths
- photo variants
- upload state
- local cleanup state
- remote cleanup state
- listing state
- retention policy

This document is the guardrail against iOS uploading data that the web app cannot read, or the web app deleting data the iOS app still needs.

---

## 2. Current Repo Facts That Affect the Contract

Current code already has these local/frontend models:

### `ItemPacket`

Current item fields include:

- `id`
- `remoteId`
- `storeId`
- `batchId`
- `itemNumber`
- `status`
- `photoIds`
- `listingStatus`
- `uploadStatus`
- `remoteStatus`
- `listedAt`
- `remoteDeleteEligibleAt`
- `remoteExpiresAt`
- `remoteDeletedAt`
- `sku`
- `note`
- `weight`
- `dimensions`

### `StoredPhoto`

Current photo fields include:

- `id`
- `remoteId`
- `blob`
- `originalBlob`
- `thumbnailBlob`
- `mimeType`
- `size`
- `capturedAt`
- `savedAt`
- `uploadStatus`
- `remoteStatus`
- `localStatus`
- `remoteDeleteEligibleAt`
- `remoteExpiresAt`
- `remoteDeletedAt`
- dimensions and diagnostics

### `BatchRecord`

Current batch fields include:

- `id`
- `storeId`
- `name`
- `status`
- `remoteRetentionMode`
- `uploadStatus`
- `itemCount`
- `photoCount`
- `uploadCompletedAt`
- `localCleanupCompletedAt`
- `remoteExpiresAt`
- `remoteDeletedAt`

### Current Supabase upload behavior

Current upload code:

- resolves or creates remote store by `short_code`
- resolves or creates remote batch by `store_id` + `name`
- resolves or upserts remote item by `batch_id` + `sequence`
- creates a remote photo ID separately from local photo ID
- uploads `original`, `listing`, and `thumbnail` variants
- upserts `photo_variants` by `photo_id, variant_type`
- marks photos verified after upload
- updates item `main_photo_id`

This contract keeps those ideas but makes the ID and cleanup rules explicit.

---

## 3. Canonical Ownership Model

MVP uses one shared account, but tables should still be owner-scoped now to avoid a future security rewrite.

Every user-created top-level entity should include:

```sql
owner_id uuid not null references auth.users(id)
```

Recommended owner rules:

- `stores.owner_id` is required.
- `batches.owner_id` is required and must match parent store owner.
- `items.owner_id` is required and must match parent batch owner.
- `photos.owner_id` is required and must match parent item owner.
- `photo_variants.owner_id` is required and must match parent photo owner.

All RLS policies should require:

```sql
auth.uid() is not null and owner_id = auth.uid()
```

For MVP, the only real user may be Joe, but the schema should not assume the project will only ever have one authenticated user.

---

## 4. Canonical ID Rules

### 4.1 Local IDs

Native iOS and web fallback capture may create local IDs before upload.

Local IDs are client-only and may not equal remote IDs.

Examples:

```txt
local item id: item-171...-abc123
remote item id: uuid
local photo id: photo-171...-def456
remote photo id: uuid
```

### 4.2 Remote IDs

Remote IDs are canonical in Supabase.

Remote records should use UUIDs.

Required invariant:

```txt
localPhoto.remoteId == Supabase photos.id
localItem.remoteId == Supabase items.id
photo_variants.photo_id == Supabase photos.id
```

### 4.3 Cleanup Must Use Remote IDs

Remote operations must never query Supabase by local-only IDs.

Correct mapping:

| Operation | ID to use |
|---|---|
| Update local IndexedDB photo | `photo.id` |
| Update Supabase `photos` row | `photo.remoteId` |
| Query Supabase `photo_variants` | `photo.remoteId` |
| Delete storage objects | storage keys from variants for `photo.remoteId` |
| Update local photo after remote deletion | `photo.id` |

---

## 5. Storage Bucket Contract

### 5.1 Bucket

Canonical bucket:

```txt
photo-assets
```

The bucket should be private.

### 5.2 Recommended Storage Path

For long-term safety, storage paths should be owner-scoped:

```txt
{owner_id}/stores/{store_id}/batches/{batch_id}/items/{item_id}/photos/{photo_id}/{variant}
```

Examples:

```txt
9c.../stores/5d.../batches/a1.../items/f4.../photos/71.../original
9c.../stores/5d.../batches/a1.../items/f4.../photos/71.../listing
9c.../stores/5d.../batches/a1.../items/f4.../photos/71.../thumbnail
```

### 5.3 Current Repo Path Mismatch

Current web upload code uses a path equivalent to:

```txt
{remote_store_id}/batches/{remote_batch_id}/items/{remote_item_id}/photos/{remote_photo_id}/{variant}
```

New uploads should use the owner-scoped path above.
Legacy path support may remain only during a transition window if needed for compatibility.

Reason: owner-scoped storage paths make RLS policies simpler and safer and align the iOS and web clients on one canonical layout.

### 5.4 Photo Access During Desktop Review

The bucket remains private.

Desktop and native clients must access image files through:

- signed URLs, or
- authenticated storage download calls

For MVP desktop review, signed URLs are preferred because they keep the queue and detail read path simple while preserving private storage.

---

## 6. Photo Variants

Canonical variants:

| Variant | Required for MVP? | Purpose |
|---|---:|---|
| `original` | Yes | Highest-quality captured image; temporary remote handoff source. |
| `listing` | Yes | Listing-ready image, usually cropped/downscaled/compressed as needed. |
| `thumbnail` | Recommended | Fast desktop queue/detail preview. |

If native MVP needs to move faster, it may initially upload `original` + `listing` only, but the web app must tolerate missing thumbnails.

The long-term contract should support all three variants.

---

## 7. Canonical Status Enums

### 7.1 Item Capture Status

```ts
export type ItemCaptureStatus =
  | 'draft'
  | 'complete'
  | 'uploaded'
```

Meaning:

| Status | Meaning |
|---|---|
| `draft` | Item is currently being captured or edited locally. |
| `complete` | Item capture is locally complete and ready for upload/listing queue. |
| `uploaded` | Item has at least one successful remote sync pass. |

### 7.2 Listing Status

```ts
export type ListingStatus =
  | 'new'
  | 'listed'
  | 'hold'
  | 'needs_retake'
```

Meaning:

| Status | Meaning |
|---|---|
| `new` | Waiting to be listed manually on eBay. |
| `listed` | Lister has manually completed the eBay listing. |
| `hold` | Item should not be listed yet. |
| `needs_retake` | Item needs more or better photos. |

### 7.3 Photo Upload Status

```ts
export type PhotoUploadStatus =
  | 'local'
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'verified'
  | 'failed'
```

Meaning:

| Status | Meaning |
|---|---|
| `local` | Captured locally, not queued. |
| `queued` | Selected for upload. |
| `uploading` | Upload currently in progress. |
| `uploaded` | Remote object/table writes completed but not fully verified. |
| `verified` | Remote row and expected variants are confirmed. |
| `failed` | Last upload attempt failed. |

### 7.4 Photo Remote Status

```ts
export type PhotoRemoteStatus =
  | 'not_uploaded'
  | 'uploaded'
  | 'verified'
  | 'delete_eligible'
  | 'deleting'
  | 'deleted'
  | 'failed'
```

Meaning:

| Status | Meaning |
|---|---|
| `not_uploaded` | No usable remote photo exists. |
| `uploaded` | Remote write happened but verification is incomplete. |
| `verified` | Remote photo and variant records are usable. |
| `delete_eligible` | Remote photo may be deleted under retention rules. |
| `deleting` | Remote cleanup is in progress. |
| `deleted` | Remote objects are deleted and records marked deleted. |
| `failed` | Remote action failed. |

### 7.5 Local File Status

```ts
export type PhotoLocalStatus =
  | 'present'
  | 'safe_to_clear'
  | 'cleared'
  | 'missing'
```

Meaning:

| Status | Meaning |
|---|---|
| `present` | Local file/blob exists. |
| `safe_to_clear` | Remote upload is verified and local file can be deleted. |
| `cleared` | Local file/blob was deleted but metadata remains. |
| `missing` | Expected local file is missing unexpectedly. |

---

## 8. Lifecycle State Machine

### 8.1 Capture to Upload

```txt
photo localStatus=present, uploadStatus=local, remoteStatus=not_uploaded
→ queued
→ uploading
→ uploaded
→ verified
→ localStatus=safe_to_clear
```

### 8.2 Local Cleanup

```txt
localStatus=safe_to_clear
→ clear local image data/files only
→ localStatus=cleared
```

Required invariant:

```txt
local cleanup must preserve metadata and remoteId
```

### 8.3 Listing and Retention

```txt
item listingStatus=new
→ listingStatus=listed
→ listedAt set
→ remoteDeleteEligibleAt set
→ remoteExpiresAt set
→ remote cleanup blocked until expiresAt
→ remoteStatus=delete_eligible
→ manual cleanup
→ remoteStatus=deleted
```

### 8.4 Retake Flow

```txt
listingStatus=needs_retake
→ item remains visible in queue
→ iOS app can capture additional photos later
→ upload new photos
→ listingStatus may return to new
```

---

## 9. MVP Retention Policy

Canonical MVP policy:

```txt
delete_7d_after_listed
```

Meaning:

- Start time: `items.listed_at`
- Remote delete eligible date: `items.listed_at + 7 days`
- Deletion mode: manual user-triggered action
- Remote delete before expiration: blocked
- Local cleanup after upload verification: allowed independently of remote retention

Do not implement these modes yet:

- `delete_24h_after_listed`
- `delete_3d_after_listed`
- `delete_7d_after_upload`
- `delete_7d_after_batch_complete`
- fully automatic deletion

They may exist later, but they require exact timestamp semantics first.

---

## 10. Target Supabase Tables

This is the target contract. Existing migrations should be checked and adjusted to match before native iOS implementation.

### 10.1 `stores`

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key. |
| `owner_id` | uuid | Yes | `auth.users.id`. |
| `name` | text | Yes | Display name. |
| `short_code` | text | Yes | Short store label. Unique per owner. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

Constraints:

```sql
unique (owner_id, short_code)
```

### 10.2 `batches`

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key. |
| `owner_id` | uuid | Yes | Owner. |
| `store_id` | uuid | Yes | FK to stores. |
| `name` | text | Yes | Batch display name. |
| `status` | text | Yes | `active`, `ready_for_listing`, `archived`. |
| `upload_status` | text | Yes | `local`, `partial`, `uploaded`, `failed`. |
| `remote_retention_mode` | text | Yes | MVP default `delete_7d_after_listed`. |
| `item_count` | integer | Yes | Denormalized count. |
| `photo_count` | integer | Yes | Denormalized count. |
| `upload_completed_at` | timestamptz | No | Set after full successful upload. |
| `remote_expires_at` | timestamptz | No | Earliest remote expiry in batch, if any. |
| `remote_deleted_at` | timestamptz | No | Set when all remote assets deleted. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

Constraints:

```sql
unique (owner_id, store_id, name)
```

### 10.3 `items`

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key. |
| `owner_id` | uuid | Yes | Owner. |
| `store_id` | uuid | Yes | FK to stores. |
| `batch_id` | uuid | Yes | FK to batches. |
| `sequence` | integer | Yes | Item number within batch. |
| `status` | text | Yes | Listing status: `new`, `listed`, `hold`, `needs_retake`. |
| `capture_status` | text | Yes | `draft`, `complete`, `uploaded`. |
| `upload_status` | text | Yes | Item-level aggregate. |
| `remote_status` | text | Yes | Item-level aggregate. |
| `main_photo_id` | uuid | No | FK to primary photo. |
| `sku` | text | No | Optional. |
| `notes` | text | No | Optional. |
| `weight` | text | No | Optional for now. |
| `dimensions` | text | No | Optional for now. |
| `listed_at` | timestamptz | No | Set when listed. |
| `photo_retention_until` | timestamptz | No | Current item remote expiry date. |
| `remote_delete_eligible_at` | timestamptz | No | Usually same as expiry date for MVP. |
| `remote_deleted_at` | timestamptz | No | Set when all item remote photos deleted. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

Constraints:

```sql
unique (batch_id, sequence)
```

### 10.4 `photos`

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key. This is remote photo ID. |
| `owner_id` | uuid | Yes | Owner. |
| `store_id` | uuid | Yes | FK to stores. |
| `batch_id` | uuid | Yes | FK to batches. |
| `item_id` | uuid | Yes | FK to items. |
| `order_index` | integer | Yes | Photo order within item. |
| `captured_at` | timestamptz | Yes | Original capture time. |
| `local_status` | text | Yes | Client-reported local state. |
| `upload_status` | text | Yes | Upload state. |
| `remote_status` | text | Yes | Remote state. |
| `remote_verified_at` | timestamptz | No | Set after variant verification. |
| `upload_attempt_count` | integer | Yes | Incremented on each attempt. |
| `remote_delete_eligible_at` | timestamptz | No | Set when item listed. |
| `remote_expires_at` | timestamptz | No | Delete blocked until this time. |
| `remote_deleted_at` | timestamptz | No | Set after remote objects are deleted. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

Constraints:

```sql
unique (item_id, order_index)
```

### 10.5 `photo_variants`

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key or generated. |
| `owner_id` | uuid | Yes | Owner. |
| `photo_id` | uuid | Yes | FK to photos. |
| `variant_type` | text | Yes | `original`, `listing`, `thumbnail`. |
| `storage_bucket` | text | Yes | `photo-assets`. |
| `storage_key` | text | Yes | Path in bucket. |
| `width` | integer | No | Pixel width. |
| `height` | integer | No | Pixel height. |
| `bytes` | bigint | No | Size in bytes. |
| `mime_type` | text | No | Usually image/jpeg or image/heic. |
| `uploaded_at` | timestamptz | No | Set after storage upload. |
| `verified_at` | timestamptz | No | Set after verification. |
| `remote_deleted_at` | timestamptz | No | Set after storage object deletion. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

Constraints:

```sql
unique (photo_id, variant_type)
```

### 10.6 `upload_jobs`

MVP can avoid a full upload job table if client-local retry state is enough. If retained, use it for audit/retry visibility only.

| Column | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | Yes | Primary key. |
| `owner_id` | uuid | Yes | Owner. |
| `batch_id` | uuid | Yes | FK to batches. |
| `status` | text | Yes | `queued`, `running`, `complete`, `failed`. |
| `started_at` | timestamptz | No | Start time. |
| `completed_at` | timestamptz | No | Completion time. |
| `error_message` | text | No | Last error. |
| `created_at` | timestamptz | Yes | Default now. |
| `updated_at` | timestamptz | Yes | Updated on write. |

---

## 11. RLS Contract

Supabase docs state that RLS should be enabled on exposed `public` schema tables, and that unauthenticated requests return `auth.uid() = null`. Therefore policies should explicitly require a non-null `auth.uid()`.

Minimum policy rule:

```sql
using (auth.uid() is not null and owner_id = auth.uid())
with check (auth.uid() is not null and owner_id = auth.uid())
```

MVP direct-client access requires authenticated users to be able to:

- select their own stores/batches/items/photos/variants
- insert their own stores/batches/items/photos/variants
- update their own stores/batches/items/photos/variants
- delete or mark deleted only their own remote photo objects/rows

Do not expose service-role keys to iOS or web clients.

---

## 12. Storage RLS Contract

Supabase Storage uses RLS policies on `storage.objects`.

For the owner-scoped path contract, storage policies should require the first path folder to match the authenticated user ID.

Conceptual policy rule:

```sql
bucket_id = 'photo-assets'
and (storage.foldername(name))[1] = (select auth.uid()::text)
```

Required permissions:

| Action | Required object policy |
|---|---|
| Upload new file | `insert` |
| Upsert/overwrite | `select`, `insert`, `update` |
| Read/download | `select` |
| Delete | `delete` |

MVP may use upsert during retries, so storage policies must account for update/select if upsert is used.

---

## 13. Client Write Contract

### 13.1 iOS Client

The iOS app must:

- create or select store and batch
- create item rows or upload a complete batch transactionally enough to avoid orphaned data
- generate remote UUIDs before storage upload or receive them from Supabase
- upload variants
- write `photos` and `photo_variants`
- update statuses after verification
- retain local files until verification

### 13.2 Web Client

The web app must:

- read remote store/batch/item/photo/variant rows
- display queue from remote data
- update listing status
- set retention dates when item is marked listed
- trigger manual remote cleanup
- tolerate locally cleared photos if remote variants still exist

### 13.3 Shared Invariants

- No item should be considered listable without at least one verified or locally present photo.
- No local file should be cleared before its remote photo is verified.
- No remote photo should be deleted before the retention window expires.
- No remote cleanup should operate on local IDs.
- No client should treat `uploaded` as equivalent to `verified`.

---

## 14. Verification Contract

A photo is `verified` only when:

- `photos.id` exists remotely
- required variants exist in `photo_variants`
- storage objects for required variants exist or were successfully uploaded in the same operation
- `photos.remote_status = verified`
- local photo record has `remoteId`

For MVP, verification may be write-success based. Later verification can explicitly query storage/object metadata.

---

## 15. Required Contract Fixes Before iOS Migration

1. Change remote cleanup to use `photo.remoteId` for Supabase queries/updates.
2. Change local cleanup to preserve photo metadata and clear only local binary data/files.
3. Narrow retention mode behavior to `delete_7d_after_listed` until other timestamp bases are implemented.
4. Decide whether to adopt owner-scoped storage paths before iOS upload code is written.
5. Add tests for local ID vs remote ID mismatch.

---

## 16. References

- Supabase Swift reference: https://supabase.com/docs/reference/swift/introduction
- Supabase Swift storage upload: https://supabase.com/docs/reference/swift/storage-from-upload
- Supabase Swift OTP auth: https://supabase.com/docs/reference/swift/auth-signinwithotp
- Supabase mobile deep linking: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
