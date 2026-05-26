# Native iOS Capture App Spec

**Project:** eBay Photo App  
**Client:** native iOS capture app  
**Status:** implementation spec for the current native direction  
**Primary responsibility:** reliable iPhone item/photo capture, local queue management, and desktop handoff via explicit submit  

---

## 1. Purpose

The native iOS app exists to replace unreliable Safari/PWA camera capture with a reliable, fast, native iPhone workflow.

It is not a full replacement for the desktop app. It is a capture + lightweight queue client.

The iPhone app should do the smallest set of native things that materially improve the workflow:

- reliable camera preview
- high-quality still capture
- fast repeated item grouping
- real local multi-item queue
- local temporary file storage
- foreground submit/upload to Supabase
- safe local retention until upload safety conditions are met
- lightweight Finish Item checkpoint before queueing captured photos

The iPhone app should not become the final listing workspace.

---

## 2. Technology Direction

Recommended default:

- Swift
- SwiftUI app shell
- AVFoundation camera implementation
- Supabase Swift SDK
- local filesystem storage for captured image files
- SQLite for local metadata/state

## 2.1 Locked MVP Defaults

The implementation choices for the current native slice are fixed as follows:

- Auth uses Supabase email OTP code entry by default.
- Password sign-in may be used as a development fallback for email rate-limit recovery, but it is not the primary product auth flow.
- Local image files live in Application Support.
- Local metadata/state lives in SQLite.
- New uploads use the V1 storage path from `docs/BACKEND_CONTRACT_V1.md`.
- `listing` and `thumbnail` variants are required in V1.
- `original` upload is deferred in V1.
- Browser/PWA capture remains fallback or diagnostic only, not primary production capture.
- Submit/upload is a deliberate user action in MVP.

Do not use a webview as the main capture surface if the purpose of migration is to escape Safari/PWA camera inconsistencies.

---

## 3. Native Camera Requirements

### 3.1 Required

- rear camera default
- high-quality still capture
- quick repeated capture
- capture button always easy to reach
- preview stable enough for product photos
- app must retain photos locally until remote upload safety is confirmed
- camera-first flow with minimal blocking transitions

### 3.2 Desired

- 1x main camera selection
- 0.5x / ultra-wide selection if available
- tap-to-focus if straightforward
- basic exposure/focus stability
- square composition guide
- optional listing-ready square crop

### 3.3 Deferred

- manual ISO/shutter controls
- advanced white balance UI
- RAW capture
- live object detection
- barcode/ISBN scanning
- built-in photo editing
- continuous background upload

---

## 4. Core Domain Model

The iPhone app should be built around this local model:

### 4.1 CaptureWorkflow / Queue

The local working container for capture work.

- persists until submitted or deleted
- may contain items for multiple stores
- is the main local working object during capture

### 4.1.1 Current draft / queued item / submitted remote item

The mobile flow uses three distinct states:

- current draft: the active in-camera item before queueing
- queued item packet: a finalized local item ready for upload
- submitted remote item: the Supabase row/photo state after upload

The current draft is not a remote item yet. It becomes a queued item packet only after the Finish Item checkpoint is confirmed.

### 4.2 ItemPacket

Represents one item being photographed/listed.

- belongs to one store
- owns its own photos
- owns optional metadata
- owns its own submit/upload state

### 4.3 Photo

Each photo belongs to one item packet.

- stored locally inside the app until upload and retention decisions are made
- not saved to the iPhone Camera Roll by default

### 4.4 SubmitState

Tracks each item packet through states such as:

- local
- submitting
- submitted
- failed
- safe for cleanup

The camera screen should edit the currently active `ItemPacket`. The app should not treat loose ungrouped camera photos as the main data object.

---

## 5. App Screens

### 5.1 Auth Screen

Shown if no active session exists.

Required:

- email input
- send OTP code
- visible auth error state

Magic-link/deep-link auth is optional future scope and not required for the first native slice.

### 5.2 Capture Home

Purpose: start or resume the local capture workflow.

Required:

- current capture context summary
- visible local queue/workflow status
- `Open Camera`
- explicit submit/upload action
- visible upload/safe-to-clear state
- no heavy queue editing on the home screen

Exact home layout remains deferred.

### 5.3 Camera Session

Purpose: fastest possible item capture.

Required controls:

- Back
- current item number or item position
- capture button
- `Next / Finish Item`
- lightweight Finish Item checkpoint
- current photo count

Optional metadata:

- SKU
- weight
- dimensions
- notes

`Next / Finish Item` opens the lightweight checkpoint that defines the current item boundary. Everything captured or entered since the previous boundary belongs to the current draft item. Tapping `Queue & Continue` should save the current draft into the local queue as a queued item packet and immediately start a new item.

The Finish Item sheet is a checkpoint for item boundaries and optional quick details, not a required listing form. The user must be able to queue a photo-only item.

### 5.4 Local Queue Review

Purpose: review and edit the queue before final submit.

Required:

- inspect previous items
- view their photos
- edit item info
- delete bad photos
- retake or add photos for a specific item before submit

Exact review UI remains deferred.

### 5.5 Submit Status

Purpose: make foreground submit/upload transparent.

Required:

- current submit/upload stage
- per-item progress
- per-photo progress
- retry failed uploads
- keep phone awake enough for foreground upload if possible
- clearly distinguish submitted from verified/safe-to-clean

---

## 6. Capture Flow

### 6.1 Basic Flow

```txt
Open app
→ choose or confirm capture context
→ open camera
→ capture photo
→ photo is added to the current draft
→ capture more photos
→ tap Next / Finish Item
→ open Finish Item checkpoint
→ tap Queue & Continue
→ previous draft is saved into the local queue as a queued item packet
→ new draft item packet starts immediately
```

### 6.2 Review/Edit Flow

```txt
Capture several items
→ open queue review
→ inspect previous items
→ edit metadata / delete bad photos / retake / add photos
→ return to capture or proceed to submit
```

### 6.3 Submit Flow

```txt
Tap Submit
→ app submits all eligible queued item packets
→ successful packets are marked submitted
→ failed packets remain local
→ later Submit sends only new or still-unsubmitted work
```

### 6.4 Metadata Flow

Metadata is optional. Capture should never be blocked by missing SKU, weight, dimensions, or notes.

Metadata can be edited:

- before first photo
- between photos
- before `Next / Finish Item`
- during queue review
- before submit

### 6.5 Intentionally Deferred

These remain intentionally unlocked:

- exact `Done` behavior
- exact queue preview layout
- exact store-switch UI
- exact metadata fields
- exact backend batch mapping
- whether item reorder or move-between-items is MVP or later

---

## 7. Multi-Store Rules

- The app must support multiple eBay stores.
- It must not be hardcoded to exactly two stores.
- The user should be able to create/name stores and switch capture context.
- Each item packet must be associated with the correct store.
- Store is a property of each item packet, not only of the whole queue.

This means one local queue/workflow may contain items for multiple stores.

---

## 8. Local Storage Contract

The iOS app must store image files locally until remote upload safety is confirmed.

Recommended local shape:

```txt
Application Support/
  capture_workflows/
    {local_workflow_id}/
      items/
        {local_item_id}/
          photos/
            {local_photo_id}/
              original.heic or original.jpg
              listing.jpg
              thumbnail.jpg
```

Local metadata must preserve:

- local ID
- remote ID after submit/upload
- file path
- captured timestamp
- item order
- store assignment
- variant paths
- submit/upload status
- remote status
- local status
- upload attempts
- last error

Local cleanup must delete image files but keep metadata.

---

## 9. Image Variant Strategy

### 9.1 MVP Required Variants

- `listing`
- `thumbnail`

### 9.2 Deferred Variant

- `original`

### 9.3 Variant Rules

- `listing` should be suitable for manual eBay listing use.
- `thumbnail` should be small enough for fast desktop queue loading.
- If a local `original` is kept, preserve the highest practical still capture quality.

---

## 10. Submit / Upload Flow

### 10.1 Upload Timing

Start with manual foreground submit/upload:

```txt
User captures into local queue
→ user taps Submit
→ app uploads while open
→ app marks safely uploaded work accordingly
```

Do not implement background upload in the first native slice.

### 10.2 Upload Rules

- Failed upload should leave local files intact.
- Retry must reuse remote IDs when already assigned.
- Retry must not create duplicate items for the same local item packet.
- Retry must not create duplicate variants for the same photo/variant type.
- Successfully submitted work should not be duplicated by later submits.

### 10.3 Safety Rules

- Prioritize not losing photos.
- If submit/upload fails or is incomplete, local items and photos remain in the app.
- After upload is confirmed safe, the app should give the user a way to delete or retain local app copies.
- Exact cleanup timing and exact confirmation standards remain deferred.

---

## 11. Auth Requirements

The app must use the same Supabase account as the desktop web app.

Required:

- session persistence
- sign out
- auth error state
- Supabase email OTP code entry as the MVP default
- app-specific redirect/deep-link handling only if magic links are added later

Do not add multi-user roles yet.

---

## 12. Supabase Contract

The iOS app must follow `docs/BACKEND_CONTRACT_V1.md` for the current V1 handoff.
`BACKEND_CONTRACT.md` is a future-safe target reference and is not required for current V1 implementation choices.

Critical rules:

- backend `batches` remain part of the shared schema
- the exact mapping between the local queue/workflow and backend batches remains deferred
- remote IDs must be preserved after they exist
- submit/upload must not duplicate already-linked remote records
- desktop must be able to consume the submitted item packets cleanly
- MVP uses one shared account and shared backend records/tables; owner-scoped records and stricter multi-user RLS are deferred

---

## 13. Acceptance Criteria

The current native direction is successful when:

1. the user can sign in
2. the user can open the native camera
3. the user can capture multiple items with multiple photos
4. `Next` consistently creates the item boundary
5. the user can review and edit prior queued items before submit
6. the user can submit only eligible unsubmitted work
7. failed upload can retry without duplication
8. the desktop web app can see the submitted items
9. local files are not cleared before upload safety is confirmed
10. the app can close and reopen without losing an unsubmitted local queue
