# eBay Photo Handoff Camera App — Official Project Specification

**Status:** Source-of-truth planning document  
**Intended location:** Repository documentation, e.g. `docs/PROJECT_SPEC.md`  
**Audience:** AI IDE, developer, reviewer, future maintainer  
**Current build direction:** iPhone-first PWA capture app + cloud-backed item packets + store-organized desktop listing queue  
**Primary goal:** Replace the current Telegram-based eBay photo handoff workflow with a faster, cleaner, item-aware capture and listing queue system.  
**Non-goal:** This is not an eBay automation platform, AI listing writer, pricing tool, permanent photo archive, inventory/accounting system, or SaaS-first product.

---

## 1. Product Summary

Build a fast iPhone inventory camera app for eBay workflows.

The app captures item photos into clearly separated **item packets**, optionally attaches lightweight metadata such as notes, SKU, and weight, uploads photos off the phone during a foreground upload session, and gives a Mac/desktop lister a clean **store-organized queue** for manual eBay listing and checkoff.

The product should feel like:

> A fast inventory camera that automatically separates items and hands them to the lister.

It should not feel like:

> A form-heavy inventory database.

Capture speed matters more than metadata completeness.

---

## 2. Existing Workflow and Problem

Current workflow uses Telegram:

```text
Take item photos
→ send photos in Telegram
→ add notes in chat
→ lister reads chat
→ lister manually reconstructs item boundaries
→ lister creates eBay listings manually
```

Telegram works because it is:

- fast
- familiar
- cross-device
- easy for photos and notes
- acceptable that the screen/app stays open during upload

Telegram fails because:

- item boundaries are not guaranteed
- photos from multiple items/lots clump together
- notes are mixed into chat text
- lister has to infer what belongs together
- there is no store-specific work queue
- there is no listed/unlisted/hold/retake status
- there is no structured SKU/weight/notes handoff
- photos can clutter the iPhone
- there is no clean desktop listing queue

The app should preserve Telegram's speed while fixing item grouping and lister handoff.

---

## 3. Current Product Definition

A fast iPhone inventory camera app for eBay workflows that:

- captures photos into item packets
- keeps photos grouped by item, batch, and store
- lets the photographer optionally add lightweight metadata
- uploads listing-ready images and thumbnails off the phone
- keeps local app copies only until remote upload is verified
- allows local cleanup after confirmed upload
- gives the lister a desktop queue organized by store
- lets the lister manually list on eBay and check off completed items
- keeps metadata/status longer than photo files
- treats remote photos as temporary handoff assets, not permanent records

---

## 4. Product Boundaries

### 4.1 This App Is

- a camera-first capture tool
- an item-packet organizer
- a temporary photo offload workflow
- a desktop listing queue
- a store-organized workflow helper
- a manual eBay listing handoff system

### 4.2 This App Is Not Yet

Do not build these in the MVP:

- eBay API integration
- eBay listing automation
- eBay draft creation
- eBay listing publishing
- eBay status sync
- Chrome extension autofill
- AI pricing/research
- AI listing writer
- barcode/catalog lookup
- background removal
- permanent photo archive
- full inventory/accounting system
- multi-user SaaS platform
- billing
- account/team roles
- native Mac app
- ZIP-first workflow
- strict required metadata forms

These may be explored only after the capture → upload → desktop handoff loop works in real use.

---

## 5. Users

### 5.1 Photographer

The iPhone user taking item photos.

Needs:

- fast repeated photo capture
- simple item separation
- one-button transition to next item
- optional notes without interrupting capture
- square/eBay-friendly composition
- zoom/lens/focus support where feasible
- local copies kept only until upload is confirmed
- ability to capture by store
- support for both systematic books and odd/lotted items
- clear warning if uploads are pending before closing/leaving

### 5.2 Lister

The Mac/desktop user manually creating eBay listings.

Needs:

- store-separated queue
- clear item packets
- ordered photos
- first/main photo visible
- notes/SKU/weight attached to the correct item
- easy copy/paste
- image open/download/drag access
- visible listed/unlisted/hold/retake status
- no guessing where one item ends and another begins
- visibility into whether photos are fully uploaded or incomplete

---

## 6. Terminology

### Store

An organizational bucket matching how the lister works.

Examples:

- Book Store
- General Store
- Collectibles Store

This is not real eBay store integration in MVP. It is only a folder/queue system.

### Batch

A capture session or group of items.

Examples:

- `2026-05-17 Morning Books`
- `Estate Sale Batch 3`
- `General Store Shelf A`

### Item Packet

One sellable item or lot.

Contains:

- ordered photos
- optional note
- optional SKU
- optional weight
- optional dimensions later
- optional flags later
- listing/checkoff status

### Listing-Ready Image

A processed/cropped/compressed image intended for use in the eBay listing.

### Original Image

The raw or near-raw captured image. In MVP, originals are preserved locally until listing/thumbnail upload is verified. Original upload is optional.

If originals are not uploaded, clearing local app copies permanently removes local originals.

### Thumbnail

A small image variant used to make desktop/mobile queue UI fast.

---

## 7. Core MVP Loop

The MVP exists to prove this loop:

```text
iPhone capture
→ automatic item grouping
→ foreground upload
→ desktop queue
→ manual listing
→ mark listed
→ clear local copies after confirmed upload
→ temporary remote photos cleaned up later
```

Anything outside this loop should be deferred unless it directly improves this loop.

---

## 8. Primary Workflows

### 8.1 Capture Workflow

```text
Open app
→ choose store
→ start or continue batch
→ camera opens
→ take photos for current item
→ optionally open metadata overlay
→ add note/SKU/weight if useful
→ press Done / Next
→ app saves current item packet
→ app immediately starts next item
→ repeat
→ finish/upload batch
→ upload confirms
→ local app copies become safe to clear
→ user clears local copies
```

The **Done / Next** button should feel almost instant.

It should not force the user through a review screen unless the user chooses to review.

### 8.2 Lister Workflow

```text
Open desktop web queue
→ choose store
→ choose batch or unlisted queue
→ open item packet
→ view ordered photos and notes
→ manually create eBay listing
→ copy SKU/weight/notes as needed
→ download/open/drag photos
→ mark item listed
→ move to next unlisted item
```

The default lister view should prioritize unlisted items.

---

## 9. MVP Feature List

### 9.1 Mobile Capture MVP

Must include:

- open app on iPhone
- select store
- start or continue batch
- rear camera preview
- square composition guide
- capture multiple photos per item
- visible current item number
- visible photo count for current item
- first photo defaults to main photo
- one-button **Done / Next Item**
- immediate transition to next item
- optional note field
- optional SKU field
- optional weight field
- local pending capture storage using IndexedDB or OPFS
- batch review/upload screen
- foreground upload progress
- retry failed uploads
- clear local app copies only after confirmed upload

Should include if easy:

- zoom control
- basic lens selection if exposed
- tap-to-focus if feasible

Defer:

- dimensions
- templates
- photo roles
- SKU auto-increment
- many flags/tags
- barcode lookup
- AI listing helper
- background removal

### 9.2 Desktop/Lister MVP

Must include:

- desktop web queue
- store selector
- batch list
- item list
- default unlisted view
- item detail view
- ordered photo grid
- large photo preview
- first/main photo visible
- notes panel
- SKU display/copy
- weight display/copy
- image open/download access
- status controls:
  - new/unlisted
  - listed
  - hold
  - needs retake
- upload completeness per item

Should include if easy:

- copy notes button
- copy SKU button
- copy weight button
- thumbnail cards
- warning flags for failed/missing uploads

Defer:

- advanced filters
- listed-today stats
- team permissions
- eBay sync
- Chrome extension
- bulk export

### 9.3 Storage MVP

Must include:

- local pending photo queue during capture
- remote object storage for photos
- database metadata for stores/batches/items/photos
- upload status per photo
- retry failed uploads
- verified remote upload before cleanup
- manual local cleanup
- local cleanup never deletes iOS Photos library originals
- app-captured photos should not save to iOS Photos by default
- clear UI for whether photos are available, incomplete, expired/delete-eligible, or deleted

Recommended image strategy:

- create listing-ready square image client-side
- create thumbnail client-side
- preserve original locally until upload confirmed
- upload listing-ready image by default
- upload thumbnail by default
- optionally upload original later or only for selected/high-value items
- listing-ready image is the primary lister asset
- thumbnails support fast queue UI

---

## 10. Camera Requirements

### 10.1 Required

- rear camera capture
- repeated fast capture
- square composition overlay
- square listing-ready export
- preserve original until upload confirmation
- visible item number
- visible photo count
- first photo defaults to main
- local pending queue
- safe upload/cleanup state

### 10.2 Best-Effort / Spike-Dependent

These should not be guaranteed until tested on the target iPhone/Safari/PWA configuration:

- zoom
- lens selection:
  - 0.5x
  - 1x
  - macro/close-up
  - telephoto
- tap-to-focus
- focus lock

### 10.3 Not MVP

- manual exposure
- ISO
- shutter speed
- manual white balance
- pro camera UI
- advanced focus slider

### 10.4 Square Capture Rule

Do not require true native square capture.

Safe MVP rule:

```text
Show square overlay during composition.
Capture normal camera frame.
Crop/export square listing-ready image.
Preserve original until upload is confirmed.
```

### 10.5 Focus Rule

Autofocus is acceptable by default.

Focus control is desirable because the workflow may include close-up shots of:

- book copyright pages
- small text
- flaws
- signatures
- pins/small collectibles
- measurements
- glossy covers

If autofocus performs poorly in testing, tap-to-focus/focus lock should move from desirable to required.

---

## 11. Foreground Upload Policy

The MVP does not need reliable background upload.

The current Telegram workflow already requires the screen/app to stay open while uploads complete. The app can use the same assumption for MVP.

### 11.1 MVP Upload Assumption

Uploads are foreground-first.

The user is expected to keep the app open during upload, similar to Telegram.

If the app closes or upload is interrupted:

- local pending photos remain
- upload resumes when app is reopened
- failed uploads can be retried
- local copies are not cleared until remote upload is verified

### 11.2 Upload UI Must Show

- upload progress
- pending photo count
- failed upload count
- retry option
- "keep app open until upload completes" notice
- "safe to clear local copies" only after verification
- exact reasons why cleanup is blocked

Example blocked cleanup message:

```text
Cannot clear local copies yet:
- 2 photos not uploaded
- 1 thumbnail failed
- metadata sync pending
```

### 11.3 Wake Lock Rule

The app should request screen wake lock where supported, but must not rely on it.

If the phone locks, the app is backgrounded, or the browser suspends upload, the local pending queue must remain intact and upload must resume on reopen.

Every captured photo must be persisted locally before upload begins. Do not rely on in-memory queues only.

---

## 12. Temporary Storage and Retention Policy

### 12.1 Core Principle

Photos are temporary handoff assets, not permanent records.

The app only needs photos long enough to:

1. capture them safely
2. upload them successfully
3. make them available to the lister
4. allow the lister to complete the eBay listing
5. confirm they are no longer needed

After that, photos can be deleted automatically or manually.

Metadata/status can remain longer.

---

### 12.2 Local iPhone/App Copies

Keep local app copies until:

- upload succeeds
- metadata is saved
- photo is attached to the correct item
- remote photo is verified

Then mark:

```ts
localStatus = "safe_to_clear"
```

The user can manually clear them.

Important distinction:

- Photos captured inside the app can be controlled and cleared by the app.
- Photos imported from iOS Photos or another app may be uploaded, but the app should not assume it can delete the original iOS Photos library copy.

---

### 12.3 Remote Photos

Remote photos are temporary.

Default MVP retention should be conservative and predictable.

Recommended default:

```text
Delete 7 days after item/batch is marked listed or complete.
```

Manual earlier deletion is allowed once the user confirms the batch/item no longer needs photos.

Do not auto-delete photos for items marked:

- hold
- needs retake
- incomplete upload

### 12.4 Remote Retention Policy Options

```ts
type RemoteRetentionPolicy =
  | "manual"
  | "delete_24h_after_listed"
  | "delete_3d_after_listed"
  | "delete_7d_after_listed"
  | "delete_7d_after_upload"
```

Recommended MVP default:

```ts
"delete_7d_after_listed"
```

Alternative batch-based default:

```ts
"delete_7d_after_batch_complete"
```

### 12.5 Metadata Retention

Metadata should remain after photo deletion.

Metadata is small and useful for:

- status history
- debugging
- proving what was captured
- seeing what was listed
- future workflow analysis

After photo deletion, item packets may remain visible with metadata/status but without image access.

### 12.6 Cleanup Implementation Rule

Deleting database rows is not enough.

For Supabase Storage, delete files through the Storage API, then update database metadata.

Correct cleanup flow:

```text
find delete-eligible photo variants
→ delete remote objects through storage API
→ confirm deletion response
→ set remoteDeletedAt
→ update remoteStatus
→ preserve item/batch metadata
```

MVP should start with manual cleanup. Scheduled cleanup can be added after manual cleanup is reliable.

---

## 13. Stack Recommendation

### 13.1 Best First Stack

Use:

- Vite
- React
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- IndexedDB or OPFS for pending local photo queue
- same app serving mobile capture and desktop queue

Do not use `localStorage` for photo blobs.

### 13.2 Why This Stack Is Best for MVP

- fastest route to usable private MVP
- one codebase for iPhone and desktop
- database/auth/storage are integrated
- Postgres fits Store → Batch → Item → Photo well
- easy to iterate
- easier to later commercialize
- easier than assembling Cloudflare auth/database/storage from scratch
- short photo retention makes Supabase Storage more reasonable for MVP

### 13.3 Main Tradeoffs

- photo-heavy storage may eventually cost more than R2
- iPhone PWA camera may not be good enough
- local browser storage must be treated as a temporary upload queue, not durable archive
- background upload should not be assumed

### 13.4 Second-Best Stack

Cloudflare stack:

- Vite/React PWA
- Cloudflare Pages
- Workers API
- R2 object storage
- D1 for simple metadata or external Postgres for richer querying

Why it is close:

- better long-term object storage economics
- strong scalability path
- good fit if photo volume grows
- good for future productization

Why it is second for MVP:

- more assembly
- auth decisions required
- D1 is less comfortable than Postgres for future relational workflows
- slower to build than Supabase
- more custom signed upload/download logic

### 13.5 Not Recommended for First Build

Supabase + R2 hybrid is technically good but adds integration complexity too early.

Use later if Supabase Storage cost or performance becomes a real issue.

### 13.6 Native Fallback

If PWA camera testing fails:

```text
Capacitor wrapper
→ native camera/filesystem plugins
→ possibly full native iOS later
```

The app should use adapters so the camera/local storage layer can be swapped later.

---

## 14. Security and Privacy Requirements

Even for private MVP:

- photos should be private by default
- use private storage buckets
- use signed URLs for temporary photo access
- generate signed URLs on demand
- do not store signed URLs as durable database fields
- never expose service-role keys in client
- client may use only anon/public client keys
- privileged operations must happen in a server function or trusted backend context
- use row-level security if Supabase is used
- do not make image URLs permanently public unless explicitly chosen
- future commercial version should support per-store/team permissions

---

## 15. Data Model Draft

This model is intentionally simple but should be durable enough for future evolution.

### 15.1 Store

```ts
type Store = {
  id: string
  name: string
  shortCode: string
  createdAt: string
  updatedAt: string
}
```

Example:

```ts
{
  id: "store_books",
  name: "Book Store",
  shortCode: "BOOK",
  createdAt: "2026-05-17T18:00:00Z",
  updatedAt: "2026-05-17T18:00:00Z"
}
```

---

### 15.2 Batch

```ts
type BatchStatus =
  | "active"
  | "uploading"
  | "ready_for_listing"
  | "archived"

type UploadStatus =
  | "local"
  | "partial"
  | "uploaded"
  | "failed"

type RemoteRetentionMode =
  | "manual"
  | "after_upload"
  | "after_batch_ready"
  | "after_batch_listed"

type Batch = {
  id: string
  storeId: string
  name: string

  status: BatchStatus
  uploadStatus: UploadStatus

  itemCount: number
  photoCount: number

  uploadCompletedAt?: string
  localCleanupCompletedAt?: string

  remoteRetentionMode: RemoteRetentionMode
  remoteRetentionDays?: number

  remoteExpiresAt?: string
  remoteDeletedAt?: string

  startedAt?: string
  closedAt?: string

  createdAt: string
  updatedAt: string
}
```

---

### 15.3 Item

```ts
type ItemStatus =
  | "new"
  | "listed"
  | "hold"
  | "needs_retake"

type ListingIntent =
  | "single"
  | "lot"
  | "bundle"
  | "unknown"

type Item = {
  id: string
  storeId: string
  batchId: string
  sequence: number

  status: ItemStatus

  mainPhotoId?: string

  sku?: string
  notes?: string
  weight?: string

  titleHint?: string
  dimensions?: string
  listingHint?: string
  listingIntent?: ListingIntent

  tags?: string[]

  listedAt?: string
  listedBy?: string

  photoRetentionUntil?: string
  photosCleanedAt?: string

  createdAt: string
  updatedAt: string
}
```

Notes:

- `storeId` is technically derivable from `batchId`, but duplicating it on `Item` makes store-level queue queries easier.
- `mainPhotoId` should exist even if default behavior is "first photo is main."
- `tags`, `dimensions`, `titleHint`, and `listingHint` may be deferred from UI even if the model allows them.

---

### 15.4 Photo

```ts
type LocalStatus =
  | "present"
  | "safe_to_clear"
  | "cleared"
  | "missing"

type PhotoUploadStatus =
  | "local"
  | "uploading"
  | "uploaded"
  | "failed"

type RemoteStatus =
  | "not_uploaded"
  | "uploaded"
  | "verified"
  | "delete_eligible"
  | "deleting"
  | "deleted"
  | "failed"

type Photo = {
  id: string
  storeId: string
  batchId: string
  itemId: string

  order: number

  localStatus: LocalStatus
  uploadStatus: PhotoUploadStatus
  remoteStatus: RemoteStatus

  variants: {
    original?: PhotoVariant
    listing?: PhotoVariant
    thumbnail?: PhotoVariant
  }

  capturedAt: string

  remoteVerifiedAt?: string
  localClearedAt?: string

  remoteExpiresAt?: string
  remoteDeleteEligibleAt?: string
  remoteDeletedAt?: string

  uploadAttemptCount: number
  lastUploadError?: string

  createdAt: string
  updatedAt: string
}
```

---

### 15.5 Photo Variant

Do not store signed URLs as durable database fields. Store stable storage keys and generate signed URLs on demand.

```ts
type PhotoVariantType =
  | "original"
  | "listing"
  | "thumbnail"

type PhotoVariant = {
  variantType: PhotoVariantType

  localKey?: string
  storageKey?: string

  width?: number
  height?: number
  bytes?: number
  mimeType?: string
  checksum?: string

  uploadedAt?: string
  verifiedAt?: string

  remoteExpiresAt?: string
  remoteDeletedAt?: string
}
```

---

### 15.6 Upload Job

For MVP, this may live locally in IndexedDB/OPFS. It can move server-side later if needed.

```ts
type UploadJob = {
  id: string
  photoId: string
  variantType: "listing" | "thumbnail" | "original"

  status:
    | "queued"
    | "uploading"
    | "uploaded"
    | "failed"

  attemptCount: number
  lastError?: string

  createdAt: string
  updatedAt: string
}
```

---

### 15.7 Future eBay Fields

Do not build eBay integration in MVP, but these fields can be added later:

```ts
type FutureEbayFields = {
  ebayDraftId?: string
  ebayListingId?: string
  ebayAccountId?: string
  listedUrl?: string
}
```

---

## 16. Architecture Principles

### 16.1 Separate Capture Logic from Device APIs

Use adapters.

```ts
interface CameraAdapter {
  capturePhoto(options: CaptureOptions): Promise<CapturedPhoto>
}

interface LocalPhotoStore {
  save(photo: CapturedPhoto): Promise<LocalPhotoRef>
  get(ref: LocalPhotoRef): Promise<Blob>
  clear(ref: LocalPhotoRef): Promise<void>
}

interface UploadAdapter {
  uploadPhoto(photo: CapturedPhoto, itemId: string): Promise<UploadedPhoto>
}

interface ImageProcessingAdapter {
  makeListingReady(photo: CapturedPhoto): Promise<ProcessedPhoto>
  makeThumbnail(photo: CapturedPhoto): Promise<ProcessedPhoto>
}

interface SyncQueue {
  enqueuePhotoUpload(photoId: string): Promise<void>
  retryFailed(): Promise<void>
}
```

### 16.2 Backend Should Not Care About Capture Source

The backend should accept the same entities whether capture comes from:

- PWA
- Capacitor app
- native iOS app
- future Telegram bot prototype
- future Chrome extension

### 16.3 Keep eBay Integration Out of MVP

Manual listing first.

### 16.4 Treat Originals as Temporary

Originals are safety assets, not permanent archive assets.

### 16.5 Optimize for Speed Over Metadata Completeness

The app should allow:

- photos only
- photos + note
- photos + SKU
- photos + weight

Not every item needs every field.

---

## 17. MVP Screens

### 17.1 Mobile: Home / Store Selection

Shows:

- stores
- active batches
- recent upload status
- pending upload warnings
- start new batch

### 17.2 Mobile: Start Batch

Fields:

- store
- optional batch name
- optional template/default mode later
- optional retention setting later

### 17.3 Mobile: Capture Item

Primary screen.

Shows:

- live camera preview
- store/batch
- item number
- photo count
- square guide
- zoom controls if available
- lens buttons if available
- capture button
- Done / Next Item button
- optional metadata overlay button/drawer

### 17.4 Mobile: Metadata Overlay

Optional drawer over capture screen.

Fields:

- notes
- SKU
- weight

Later/deferred fields:

- dimensions
- listing hint
- single/lot/unknown
- quick flags

### 17.5 Mobile: Batch Review / Upload

Shows:

- item count
- photo count
- estimated upload size
- upload progress
- pending upload count
- failed uploads
- retry failed
- uploaded/safe-to-clear indicator
- blocked cleanup reasons
- clear local app copies button

### 17.6 Desktop: Store Queue

Shows stores as folders/cards.

Each store shows:

- active batches
- unlisted count
- needs retake count
- incomplete upload count if relevant

### 17.7 Desktop: Batch Queue

Shows batches for selected store.

Fields:

- batch name
- date
- item count
- photo count
- upload status
- listing progress
- remote photo availability state

### 17.8 Desktop: Item List

Shows item cards.

Each card:

- thumbnail
- item number
- SKU
- photo count
- upload completeness
- photo availability state
- status
- quick action:
  - mark listed
  - needs retake
  - hold

### 17.9 Desktop: Item Detail

Shows:

- large selected photo
- ordered photo grid
- main photo indicator
- notes
- SKU
- weight
- copy buttons
- image download/open
- upload completeness
- photo availability/retention date
- status controls

---

## 18. Photo Availability UI

The lister queue should clearly show whether photos are still available.

Examples:

```text
Item 014 — New — photos available
Item 015 — Listed — photos available until May 24
Item 016 — Listed — photos deleted
Item 017 — Hold — photos retained
Item 018 — Needs retake — photos retained
Item 019 — Upload incomplete — 4/6 photos available
```

If photos are deleted, the item packet may remain visible with metadata and status but without image access.

---

## 19. Build Phases

### Phase 0 — Camera Feasibility Spike

Goal:

Prove iPhone PWA camera capture is good enough before building the full app.

Build only:

- open camera on iPhone
- rear camera preview
- square overlay
- capture repeated photos
- crop/export square image
- store local pending images using IndexedDB or OPFS
- clear local test images
- test zoom availability
- test lens enumeration
- test tap-to-focus/focus behavior if available
- test 20–50 photo session
- test local pending images survive refresh/reopen before upload
- test no iOS Photos app clutter occurs

Success criteria:

- capture feels close enough to Telegram speed
- no major freezes
- no major memory issues
- square images are usable
- text/detail shots are readable
- local pending storage works during a session
- local pending queue survives refresh/reopen

Failure criteria:

- camera startup is slow or flaky
- repeated capture freezes/crashes
- autofocus makes detail shots unreadable
- square crop output is too low-resolution
- lens/zoom limitations make product shots annoying
- local queue cannot survive normal interruptions
- foreground upload is too fragile even with the app open

Decision:

- If PWA capture is acceptable, continue PWA.
- If not, move earlier to Capacitor/native camera.

---

### Phase 1 — End-to-End Ugly Vertical Slice

Goal:

Prove the full workflow beats Telegram, even with rough UI.

Limit the vertical slice to:

- 1 user/account
- 1 store
- 1 batch
- 3 items
- 3 photos per item
- optional notes
- optional SKU
- optional weight
- first photo as main
- upload listing image + thumbnail
- remote metadata save
- desktop queue
- item detail page
- mark listed
- manual local cleanup after confirmed upload

This phase should include the desktop queue because the queue is half the product.

---

### Phase 2 — Reliable Upload and Cleanup

Goal:

Make the app safe enough for real batches.

Build:

- foreground upload progress
- pending upload count
- failed upload list
- retry failed uploads
- resume uploads after reopen
- verify remote object exists before cleanup
- `safe_to_clear` state per photo
- manual clear uploaded local copies
- warnings for incomplete upload
- prevent accidental deletion before verification
- show exact reasons why cleanup is blocked

Important rule:

No local copy can be cleared unless:

- metadata is saved
- listing image is uploaded
- thumbnail is uploaded
- photo is associated with correct item
- remote upload is verified

---

### Phase 3 — Usable Desktop Lister Queue

Goal:

Make listing from the queue clearly better than reading Telegram.

Build:

- store selector
- batch list
- default unlisted queue
- item cards
- thumbnails
- photo count
- SKU/note/weight preview
- item detail
- large image preview
- ordered photo grid
- notes/SKU/weight panel
- copy buttons
- download/open image actions
- status controls:
  - listed
  - hold
  - needs retake
  - new
- upload completeness warnings
- photo availability state

---

### Phase 4 — Capture Speed Helpers

Add only after the basic loop works:

- quick flags:
  - needs research
  - damage/flaw
  - retake
  - hold
- dimensions field
- copy-all notes block
- search/filter
- SKU auto-increment
- basic templates
- photo roles

---

### Phase 5 — Optional Power Features

Only after private workflow is proven:

- Capacitor/native camera upgrade
- background removal
- AI listing draft helper
- Chrome extension helper
- eBay API draft creation
- eBay listing status sync
- multi-user/team support
- paid product features

---

## 20. Acceptance Criteria

### 20.1 Capture Acceptance

The app passes if:

- user can open app and start capture quickly
- user can select store/batch context
- user can take multiple photos per item
- user can press Done / Next and continue almost instantly
- item grouping is automatic
- item number is visible
- photo count is visible
- notes are optional and non-blocking
- SKU/weight are optional and non-blocking
- square composition/output is supported
- first photo defaults to main
- captured photos do not automatically clutter iOS Photos
- 20 items can be captured without app restart
- local queue survives refresh/reopen before upload

### 20.2 Upload Acceptance

The app passes if:

- upload works while the app is open
- progress is visible
- user knows to keep app open
- failed uploads can be retried
- interrupted uploads resume when app reopens
- local copies remain until upload verification
- user can manually clear safe local copies
- no unsafe delete path exists
- app shows exactly which items/photos are not safe to clear

### 20.3 Lister Acceptance

The app passes if:

- lister can open desktop queue
- lister can choose store
- lister can see unlisted items first
- lister can open item packet
- lister can view all photos in order
- lister can identify item boundaries without asking
- lister can copy notes/SKU/weight
- lister can download/open photos
- lister can mark item listed
- lister can tell whether each item is fully uploaded or incomplete
- lister no longer has to parse Telegram chat

### 20.4 Storage/Cleanup Acceptance

The app passes if:

- remote photo files are temporary
- metadata survives photo deletion
- listed/completed items can become cleanup-eligible
- hold/needs-retake/incomplete items are not auto-deleted
- manual remote cleanup deletes storage objects through storage API
- item packet remains visible after photo deletion
- UI clearly distinguishes available/deleted/incomplete photos

---

## 21. Known Risks and Mitigations

### 21.1 PWA Camera Risk

Largest technical risk.

Specific concerns:

- camera startup friction
- repeated capture speed
- camera stream interruptions
- memory usage after many photos
- inconsistent zoom support
- inconsistent lens selection
- weak focus control
- close-up text readability

Mitigation:

- Phase 0 camera spike
- keep camera APIs behind adapter
- fallback to Capacitor/native if necessary

---

### 21.2 Local Queue / Recovery Risk

Browser local storage should not be treated as a permanent archive.

Specific concerns:

- browser storage eviction
- storage quota limits
- queue corruption
- app refresh before upload
- phone lock/backgrounding
- memory-only state loss

Mitigation:

- use IndexedDB or OPFS, not localStorage
- persist each photo before upload
- show pending upload count
- keep pending batches obvious
- resume uploads on reopen
- manual cleanup only after confirmed upload

---

### 21.3 Upload / Cleanup Safety Risk

Deleting local or remote copies too early could cause data loss.

Mitigation:

- local cleanup only after verified upload
- remote cleanup only after listing/completion retention window
- separate local status, upload status, and remote status
- show blocked cleanup reasons
- start with manual cleanup
- add scheduled cleanup only after manual cleanup is proven

---

### 21.4 Desktop Queue Underbuild Risk

If desktop queue is weak, the product does not beat Telegram.

Mitigation:

- build queue in Phase 1 vertical slice
- prioritize unlisted queue
- prioritize image access/copy/checkoff
- keep listing workflow manual but fast

---

### 21.5 Metadata Creep Risk

Too many fields will make capture slower than Telegram.

Mitigation:

- only photos and notes are core
- SKU optional
- weight optional
- dimensions/templates/flags deferred
- no required metadata per item

---

### 21.6 Commercialization Risk

This may be highly useful privately but not automatically SaaS-worthy.

Mitigation:

- validate with other resellers later
- avoid billing/team complexity early
- build private workflow first
- commercialize only after repeated real-world use proves value

---

## 22. AI IDE Implementation Guardrails

When using this document in an AI IDE, enforce these rules:

1. Do not expand scope beyond the current build phase.
2. Do not add eBay API, AI listing generation, pricing research, Chrome extension, billing, or team features unless explicitly requested.
3. Do not build a generic inventory system.
4. Do not build a permanent photo archive.
5. Do not require metadata before allowing capture.
6. Do not use `localStorage` for photo blobs.
7. Do not store signed URLs as permanent database fields.
8. Do not delete local app copies before verified remote upload.
9. Do not auto-delete remote photos for hold, needs-retake, or incomplete items.
10. Keep camera/local-storage/upload logic behind adapters.
11. Optimize for fast capture first, desktop handoff second, polish later.
12. Keep the desktop queue in the early vertical slice.

---

## 23. First Build Target

The first implementation milestone is **Phase 0: Camera Feasibility Spike**.

Do not start with database schema polish, desktop design polish, eBay features, or account/team features.

The first spike should answer:

> Can the iPhone PWA camera experience capture 20–50 item photos quickly, square-crop them, store them locally, survive refresh/reopen, and avoid iOS Photos clutter?

If yes, continue with the PWA path.

If no, move earlier to Capacitor/native camera.

---

## 24. Current Working Conclusion

The strongest current plan is:

```text
Build a PWA-first eBay photo handoff app.

Start with:
- iPhone camera capture
- square overlay/crop
- item packet grouping
- foreground upload
- local pending queue
- safe local cleanup
- temporary remote photo storage
- desktop store queue
- manual listed checkoff

Use:
- React
- Vite
- TypeScript
- Supabase Auth/Postgres/Storage
- IndexedDB or OPFS pending upload queue
- private storage buckets
- generated signed URLs on demand

Fallback:
- move to Capacitor/native only if PWA camera testing fails
```

The project is ready to start building if the first milestone is the camera feasibility spike, followed immediately by an ugly end-to-end vertical slice.
