# Backend Contract

**Project:** eBay Photo App  
**Status:** required contract before native iOS migration  
**Backend:** Supabase Auth + Postgres + Storage  
**Primary clients:** native iPhone capture app and web desktop management app

---

## 1. Purpose

This document defines the shared contract that both clients must obey.

The native iPhone app and web desktop app must be able to evolve independently. That is only safe if they agree on:

- IDs
- table ownership
- storage paths
- photo variants
- upload state
- local cleanup state
- remote cleanup state
- listing state
- retention policy

This document is the guardrail against iPhone submitting data that the web app cannot read, or the web app deleting data the iPhone app still needs.

---

## 2. Mobile Interpretation Rule

Backend `batches` remain part of the shared remote schema.

However:

- the iPhone user-facing concept is a local capture workflow / queue made of item packets
- one local queue may contain items from multiple stores
- the exact mapping from local queue/workflow to backend `batches` is intentionally deferred

This contract defines the remote shape after submit/upload. It does not force the mobile UX to expose backend batch concepts directly.

---

## 3. Canonical Ownership Model

MVP uses one shared account, but tables should still be owner-scoped now to avoid a future security rewrite.

Every user-created top-level entity should include:

```sql
owner_id uuid not null references auth.users(id)
```

Recommended owner rules:

- `stores.owner_id` is required
- `batches.owner_id` is required and must match parent store owner
- `items.owner_id` is required and must match parent batch owner
- `photos.owner_id` is required and must match parent item owner
- `photo_variants.owner_id` is required and must match parent photo owner

---

## 4. Canonical ID Rules

### 4.1 Local IDs

Native iPhone and web fallback capture may create local IDs before upload.

Local IDs are client-only and may not equal remote IDs.

### 4.2 Remote IDs

Remote IDs are canonical in Supabase.

Required invariant:

```txt
localPhoto.remoteId == Supabase photos.id
localItem.remoteId == Supabase items.id
photo_variants.photo_id == Supabase photos.id
```

### 4.3 Cleanup Must Use Remote IDs

Remote operations must never query Supabase by local-only IDs.

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

Legacy path support may remain only during a transition window if needed for compatibility.

---

## 6. Photo Variants

Canonical variants:

| Variant | Required for MVP? | Purpose |
|---|---:|---|
| `original` | Yes | Highest-quality captured image; temporary remote handoff source. |
| `listing` | Yes | Listing-ready image. |
| `thumbnail` | Recommended | Fast desktop queue/detail preview. |

If native MVP needs to move faster, it may initially upload `original` + `listing` only, but the web app must tolerate missing thumbnails.

---

## 7. Core Remote Data Model

The shared remote graph remains:

```txt
stores -> batches -> items -> photos -> photo_variants
```

The mobile local domain model remains separate:

```txt
capture workflow / queue -> item packets -> photos -> submit state
```

The exact translation layer between those two models is an implementation concern and remains partially deferred.

---

## 8. Lifecycle Safety Rules

- failed submit/upload must leave local files intact
- local cleanup must preserve metadata
- remote cleanup must use remote IDs
- successful submit/upload must not be duplicated on later submits
- desktop must be able to read the resulting remote records without access to iPhone-local files

---

## 9. Current MVP Policy Constraints

- submit/upload is manual and foreground-first on iPhone
- desktop owns listing status changes after handoff
- remote photos are temporary handoff assets
- retention remains simple until the handoff loop is proven
