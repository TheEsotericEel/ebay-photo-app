# Native iOS Capture App Spec

**Project:** eBay Photo App  
**Client:** native iOS capture app  
**Status:** implementation spec for first native migration slice  
**Primary responsibility:** reliable iPhone item/photo capture and upload to Supabase  

---

## 1. Purpose

The native iOS app exists to replace unreliable Safari/PWA camera capture with a reliable, fast, native iPhone workflow.

It is not a full replacement for the web app. It is a capture client.

The iOS app should do the smallest set of native things that materially improve the workflow:

- reliable camera preview
- high-quality still capture
- fast repeated item grouping
- local temporary file storage
- foreground upload to Supabase
- safe local cleanup after verification

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

The implementation choices for the first native slice are fixed as follows:

- Auth uses Supabase email OTP code entry by default.
- Local image files live in Application Support.
- Local metadata/state lives in SQLite.
- New uploads use the owner-scoped storage path from `BACKEND_CONTRACT.md`.
- `original` and `listing` variants are required.
- `thumbnail` should be generated when feasible, but missing thumbnails must not block upload.
- Browser/PWA capture remains fallback or diagnostic only, not primary production capture.

Do not use a webview as the main capture surface if the purpose of migration is to escape Safari/PWA camera inconsistencies.

---

## 3. Native Camera Requirements

### 3.1 Required

- rear camera default
- high-quality still capture
- quick repeated capture
- capture button always easy to reach
- preview stable enough for product photos
- app must retain photos locally until remote upload is verified

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

## 4. App Screens

### 4.1 Auth Screen

Shown if no active session exists.

Required:

- email input
- send magic link or OTP
- deep-link/session handling
- visible auth error state

MVP may use magic link if deep linking is configured reliably. If magic link flow is awkward during early TestFlight, use email OTP code entry instead.

### 4.2 Capture Home

Purpose: choose context and start camera.

Required:

- current store
- current batch
- status summary
- `Open Camera`
- `Upload Batch`
- visible upload/safe-to-clear state

### 4.3 Camera Session

Purpose: fastest possible item capture.

Required controls:

- Back
- current item number
- capture button
- next item
- done
- details overlay or compact form
- current photo count

Optional metadata:

- SKU
- weight
- dimensions
- notes

### 4.4 Local Batch Review

Purpose: verify local captures before upload.

MVP can be minimal.

Required:

- list items in current batch
- photo count per item
- item status
- delete/retake local item only if safe and intentional

### 4.5 Upload Status

Purpose: make foreground upload transparent.

Required:

- current upload stage
- per-item progress
- per-photo progress
- retry failed uploads
- keep phone awake enough for foreground upload if possible
- clearly distinguish uploaded from verified

---

## 5. Capture Flow

### 5.1 Basic Flow

```txt
Open app
→ choose active batch or default batch
→ open camera
→ capture photo
→ photo is added to current item
→ capture more photos
→ tap Next Item
→ previous item becomes complete
→ new draft item starts immediately
```

### 5.2 Done Flow

```txt
Tap Done
→ save current item metadata
→ if current item has photos, mark complete
→ return to capture home
→ batch remains available for upload
```

### 5.3 Metadata Flow

Metadata is optional. Capture should never be blocked by missing SKU, weight, dimensions, or notes.

Metadata can be edited:

- before first photo
- between photos
- before `Next Item`
- before upload

---

## 6. Local Storage Contract

The iOS app must store image files locally until remote upload is verified.

Recommended local model:

```txt
Application Support/
  batches/
    {local_batch_id}/
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
- remote ID after upload
- file path
- captured timestamp
- item order
- variant paths
- upload status
- remote status
- local status
- upload attempts
- last error

Local cleanup must delete image files but keep metadata.

---

## 7. Image Variant Strategy

### 7.1 MVP Required Variants

- `original`
- `listing`

### 7.2 Strongly Recommended Variant

- `thumbnail`

### 7.3 Variant Rules

- `original` should preserve the highest practical still capture quality.
- `listing` should be suitable for manual eBay listing use.
- `thumbnail` should be small enough for fast desktop queue loading.

The desktop web app must tolerate missing thumbnails during early native MVP.

---

## 8. Upload Flow

### 8.1 Upload Timing

Start with manual foreground upload:

```txt
User captures batch
→ user taps Upload Batch
→ app uploads while open
→ app marks verified photos safe to clear
```

Do not implement background upload in the first native slice.

### 8.2 Upload Order

Recommended order:

1. ensure store exists remotely
2. ensure batch exists remotely
3. create/upsert item
4. create/upsert photo row as uploading
5. upload variants to storage
6. create/upsert photo variant rows
7. mark photo verified
8. update item aggregate state
9. update batch aggregate state
10. mark local files safe to clear

### 8.3 Retry Rules

- Failed upload should leave local files intact.
- Retry must reuse remote IDs when already assigned.
- Retry must not create duplicate items for the same local item.
- Retry must not create duplicate variants for the same photo/variant type.
- `verified` photos can be skipped unless the user explicitly forces repair.

---

## 9. Auth Requirements

The app must use the same Supabase account as the web desktop app.

Required:

- session persistence
- sign out
- auth error state
- Supabase email OTP code entry as the MVP default
- app-specific redirect/deep-link handling only if magic links are added later

Do not add multi-user roles yet.

---

## 10. Supabase Contract

The iOS app must follow `BACKEND_CONTRACT.md`.

Critical rules:

- never use local ID as remote photo ID unless it was intentionally written to Supabase as the remote ID
- preserve remote IDs locally
- set `owner_id`
- upload to private `photo-assets`
- set `photo_variants` rows for uploaded variants
- set `photos.remote_status = verified` only after expected variants are uploaded
- never clear local files before verification

---

## 11. Local Cleanup

Local cleanup is separate from remote cleanup.

### 11.1 Allowed

After upload verification, the app may delete local image files and mark:

```txt
localStatus = cleared
```

### 11.2 Not Allowed

The app must not delete metadata required to:

- show upload history
- retry failed/partial upload
- know remote IDs
- verify remote cleanup
- prove an item was captured

---

## 12. Error Handling

Required visible errors:

- camera permission denied
- camera unavailable
- capture failed
- local file save failed
- auth failed
- upload failed
- storage upload failed
- remote table write failed
- verification failed
- local cleanup failed

Errors should be copyable where useful.

---

## 13. MVP Acceptance Tests

The iOS app MVP passes when:

1. User can sign in.
2. User can open native camera.
3. User can capture at least 3 items with multiple photos each.
4. User can add optional metadata to at least one item.
5. User can upload the batch to Supabase.
6. Upload retry works after a forced network failure.
7. Desktop web app can see uploaded items.
8. Local images are not clearable before verification.
9. Local images are clearable after verification without losing metadata.
10. App can close/reopen without losing an unuploaded batch.

---

## 14. First Build Slice

The first slice should be intentionally ugly and narrow.

Build only:

- sign in or hard-gated session setup
- one default store
- one active batch
- native camera
- capture photo
- next item
- local persistence
- upload original/listing variants
- desktop visibility proof

Do not build:

- polished camera UI
- settings drawer
- advanced queue management
- background upload
- retake request sync
- App Store onboarding

---

## 15. References

- Apple AVFoundation: https://developer.apple.com/documentation/avfoundation
- Apple `AVCapturePhotoOutput`: https://developer.apple.com/documentation/avfoundation/avcapturephotooutput
- Apple `NSCameraUsageDescription`: https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription
- Supabase Swift reference: https://supabase.com/docs/reference/swift/introduction
- Supabase Swift upload file: https://supabase.com/docs/reference/swift/storage-from-upload
- Supabase Swift OTP auth: https://supabase.com/docs/reference/swift/auth-signinwithotp
- Supabase mobile deep linking: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
