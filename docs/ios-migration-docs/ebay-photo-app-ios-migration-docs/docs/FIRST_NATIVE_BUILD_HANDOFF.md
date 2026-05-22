# First Native Build Handoff

**Status:** implementation handoff for the current native iOS build direction  
**Date:** 05/21/2026  
**Purpose:** provide one compact starting point for building the first useful native iOS capture client from the migration docs.

## 1. Product Goal

Build the smallest native iPhone app that proves this end-to-end handoff:

```txt
iPhone native capture
→ local queue persistence
→ explicit submit/upload to Supabase
→ desktop web visibility
→ manual listing
→ retention / cleanup state
```

The native app is the production capture client. The web app remains the desktop queue and review client.

## 2. Locked Decisions

These assumptions are fixed for the current native build direction:

- Auth uses Supabase email OTP code entry.
- Password sign-in may be used as a development fallback for email rate-limit recovery, but it is not the primary product auth flow.
- Native local files live in Application Support.
- Native metadata/state lives in SQLite.
- New uploads use the V1 storage path from `docs/BACKEND_CONTRACT_V1.md`.
- `listing` and `thumbnail` photo variants are required in V1.
- `original` upload is deferred in V1.
- Browser/PWA capture remains fallback and diagnostic only.
- The build is iPhone-only and portrait-first.
- The iPhone app uses a real local multi-item queue.
- `Next` is the official item boundary.
- Submit/upload is deliberate in MVP.
- Store is an item-level property, so one local queue may contain items for multiple stores.
- Exact `Done` behavior and exact backend batch mapping remain deferred.

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
- final desktop workflow expansion

## 4. Native App Responsibilities

The native iOS app owns:

- sign in
- capture context editing
- live camera preview
- lens switching
- capture
- item packet creation
- local multi-item queue
- optional item metadata
- local file persistence
- submit/upload queue
- submit/upload retry
- local cleanup after upload safety is confirmed
- reporting upload / cleanup state to Supabase

The native app does not own:

- desktop queue browsing
- manual eBay listing creation
- remote cleanup policy decisions
- final listing workspace behavior
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

Desktop-specific behavior should not be expanded here unless it directly affects the mobile handoff.

## 6. Shared Backend Contract

The current V1 shared backend contract is defined in `docs/BACKEND_CONTRACT_V1.md`.
`BACKEND_CONTRACT.md` remains a future-safe target reference.

The essential V1 rules are:

- remote rows are canonical and use UUIDs
- local IDs are client-only
- cleanup uses `photo.remoteId` for remote operations
- local cleanup preserves metadata and remote IDs
- storage is private
- image access for desktop review uses signed URLs or authenticated downloads
- backend `batches` remain shared remote records, but the exact mobile queue-to-batch mapping stays deferred
- MVP uses one shared account and shared backend records/tables; owner-scoped records/RLS hardening are deferred

## 7. First Native Screen Set

### 7.1 Auth

- email / OTP sign in
- loading state
- error state
- session persistence

### 7.2 Capture Home

- current capture context summary
- local queue/workflow status
- open camera
- submit/upload action
- safe-to-clear state

### 7.3 Camera Session

Required:

- back
- current item number or position
- capture
- `Next`
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

### 7.4 Local Queue Review

- inspect previous items
- show photo counts
- edit item metadata
- delete bad photos
- add/retake photos for a specific queued item

### 7.5 Submit Status

- submit/upload stage
- per-item progress
- per-photo progress
- retry failed uploads
- clear submitted / verified / safe-to-clear distinction

## 8. Capture Flow

The required loop is:

```txt
open app
→ sign in
→ choose or confirm capture context
→ open camera
→ capture photo(s)
→ Next
→ repeat
→ review queue if needed
→ Submit
→ verify upload safety
→ allow local cleanup
→ desktop sees the same data
```

Metadata must never block capture.

## 9. Local Storage Rules

- photo files live locally until upload safety is confirmed
- metadata must survive local cleanup
- remote IDs must be preserved locally
- local cleanup removes blobs/files only
- local cleanup marks local file state accordingly

Recommended local shape:

```txt
Application Support/
  capture_workflows/
    {local_workflow_id}/
      items/
        {local_item_id}/
          photos/
            {local_photo_id}/
              original
              listing
              thumbnail
```

## 10. Upload Rules

Upload rules:

- reuse remote IDs when they already exist
- do not duplicate items or variants
- do not clear local files before upload safety is confirmed
- later submit actions send only new or still-unsubmitted work

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
5. `Next` consistently saves an item into the queue and starts the next item
6. the user can review/edit queued items before submit
7. the user can submit eligible unsubmitted work
8. failed upload can retry
9. the desktop web app can see the submitted items
10. local files are not clearable before upload safety is confirmed
11. local files are clearable after confirmation without losing metadata
12. the app can close and reopen without losing an unsubmitted local queue
