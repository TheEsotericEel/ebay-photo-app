# First Native Build Handoff

**Status:** implementation handoff for the first native iOS build  
**Date:** 2026-05-19  
**Purpose:** provide one compact starting point for building the first useful native iOS capture client from the migration docs.

## 1. Product Goal

Build the smallest native iPhone app that proves the end-to-end handoff:

```txt
iPhone native capture
→ local persistence
→ Supabase upload
→ desktop web visibility
→ manual listing
→ retention / cleanup state
```

The native app is the production capture client. The web app becomes the desktop queue and review client.

## 2. Locked Decisions

These assumptions are fixed for the first native build:

- Auth uses Supabase email OTP code entry.
- Native local files live in Application Support.
- Native metadata/state lives in SQLite.
- New uploads use the owner-scoped storage path from `BACKEND_CONTRACT.md`.
- `original` and `listing` photo variants are required.
- `thumbnail` is best-effort and may be missing.
- Browser/PWA capture remains fallback and diagnostic only.
- The build is iPhone-only and portrait-first.
- The first slice uses one account, one active store, and one active batch at a time.

## 3. Non-Goals

Do not build these in the first native slice:

- background upload
- team accounts
- eBay API automation
- AI listing generation
- pricing tools
- public SaaS onboarding
- desktop rewrite in Swift
- advanced editing or pro camera controls
- full offline conflict resolution

## 4. Native App Responsibilities

The native iOS app owns:

- sign in
- active store / batch selection
- live camera preview
- lens switching
- capture
- item grouping
- optional item metadata
- local file persistence
- upload queue
- upload retry
- local cleanup after upload verification
- reporting upload / cleanup state to Supabase

The native app does not own:

- desktop queue browsing
- manual eBay listing creation
- remote cleanup policy decisions
- browser fallback capture

## 5. Web Desktop Responsibilities

The web app owns:

- sign in with the same account
- loading remote stores / batches / items / photos
- queue sorting and filtering
- item detail review
- listing status updates
- retention visibility
- manual remote cleanup
- fallback browser capture only as a secondary path

## 6. Shared Backend Contract

The shared backend contract is defined in `BACKEND_CONTRACT.md`. The essential rules are:

- remote rows are canonical and use UUIDs
- local IDs are client-only
- cleanup uses `photo.remoteId` for remote operations
- local cleanup preserves metadata and remote IDs
- storage is private
- image access for desktop review uses signed URLs or authenticated downloads
- retention is `delete_7d_after_listed`

## 7. First Native Screen Set

### 7.1 Auth

- email / OTP sign in
- loading state
- error state
- session persistence

### 7.2 Capture Home

- current store
- current batch
- status summary
- open camera
- upload batch
- safe-to-clear state

### 7.3 Camera Session

Required:

- back
- current item number
- capture
- next item
- done
- details overlay
- current photo count

Optional:

- SKU
- weight
- dimensions
- notes

Camera behavior:

- rear camera default
- `.5` ultra-wide and `1x` main rear camera buttons when available
- stable preview
- capture must stay fast and reliable

### 7.4 Local Batch Review

- list items in current batch
- show photo counts
- show item status
- allow safe local file cleanup after verification

### 7.5 Upload Status

- upload stage
- per-item progress
- per-photo progress
- retry failed uploads
- clear verified / safe-to-clear distinction

## 8. Capture Flow

The required loop is:

```txt
open app
→ sign in
→ choose default store/batch
→ open camera
→ capture photo(s)
→ next item
→ repeat
→ done
→ upload batch
→ verify upload
→ allow local cleanup
→ desktop sees the same data
```

Metadata must never block capture.

## 9. Local Storage Rules

- photo files live locally until upload verification
- metadata must survive local cleanup
- remote IDs must be preserved locally
- local cleanup removes blobs/files only
- local cleanup marks `localStatus = cleared`

Recommended local shape:

```txt
Application Support/
  batches/
    {local_batch_id}/
      items/
        {local_item_id}/
          photos/
            {local_photo_id}/
              original
              listing
              thumbnail (best-effort)
```

## 10. Upload Rules

Upload order:

1. ensure store exists remotely
2. ensure batch exists remotely
3. upsert item
4. upsert photo
5. upload `original`
6. upload `listing`
7. upload `thumbnail` when available
8. upsert variant rows
9. mark photo verified
10. update item aggregate state
11. update batch aggregate state
12. mark local files safe to clear

Retry rules:

- reuse remote IDs when they already exist
- do not duplicate items or variants
- do not clear local files before verification

## 11. Desktop Contract

The desktop app should read remote Supabase data for items captured on iOS.

Required desktop behavior:

- show items captured by iOS
- show ordered photos
- show upload and verification state
- show listing status
- show retention date
- block cleanup before retention expires
- use signed URLs or authenticated downloads for image viewing

## 12. MVP Acceptance Criteria

The first native build is successful when:

1. the user can sign in
2. the user can open the native camera
3. the user can capture at least 3 items with multiple photos
4. the user can add optional metadata
5. the user can upload the batch
6. failed upload can retry
7. the desktop web app can see the uploaded items
8. local files are not clearable before verification
9. local files are clearable after verification without losing metadata
10. the app can close and reopen without losing an unuploaded batch

## 13. Recommended Build Order

1. confirm backend contract and schema
2. make desktop read remote data
3. build native auth
4. build native camera + item session
5. build local persistence
6. build upload and verification
7. prove desktop visibility
8. then expand UI polish and secondary controls

## 14. Important References

- `ARCHITECTURE_DECISION_IOS.md`
- `IMPLEMENTATION_DECISIONS.md`
- `BACKEND_CONTRACT.md`
- `IOS_CAPTURE_APP_SPEC.md`
- `WEB_DESKTOP_APP_SPEC.md`
- `MIGRATION_PLAN.md`
