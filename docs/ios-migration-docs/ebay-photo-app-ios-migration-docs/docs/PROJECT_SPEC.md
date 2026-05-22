# eBay Photo App — Updated Project Spec

**Status:** source-of-truth product spec for the current iPhone migration direction  
**Current direction:** native iPhone capture app + web desktop management app + shared Supabase backend  
**Primary goal:** replace the Telegram-based photo handoff workflow with a fast, item-aware capture flow and desktop listing queue  
**Primary non-goal:** this is not an eBay automation platform, AI listing writer, pricing tool, permanent inventory system, or SaaS-first product

---

## 1. Product Definition

A native iPhone capture app and web desktop management app for eBay listing workflows.

The system should:

- capture item photos into item packets
- optionally attach lightweight per-item metadata
- keep work in a local iPhone queue until the user deliberately submits it
- upload submitted work to temporary remote storage
- give the desktop lister a clean queue for manual eBay listing and checkoff

The product should feel like:

```txt
Take photos fast on iPhone.
Group them correctly by item.
Keep work local until I decide to submit it.
Open desktop queue.
List manually on eBay.
Mark item listed.
Delete photos after they are no longer needed.
```

---

## 2. Architecture Decision

The production mobile capture path is native iPhone.

The production desktop management path is web.

Supabase is the shared backend and state contract.

Browser/PWA camera capture is retained only as:

- diagnostic tooling
- fallback capture mode
- local development tool
- optional emergency path

It is not the primary production capture path.

---

## 3. Users and Roles

### 3.1 Photographer

The person using the iPhone to capture item photos.

For MVP, this is the same person/account as the lister.

Needs:

- open camera quickly
- capture multiple photos per item
- move to the next item with almost no friction
- optionally enter lightweight item metadata
- review/edit queued items before submit
- submit work deliberately
- clear local phone files only after upload is safely confirmed

### 3.2 Lister

The person using desktop web to manually create eBay listings.

For MVP, this is the same person/account as the photographer.

Needs:

- see items grouped correctly
- view photos in order
- copy metadata/notes as needed
- mark items listed / hold / needs retake
- see upload and cleanup status
- know when photos are safe to delete

---

## 4. Implementation Defaults

Locked product-level defaults:

- Auth defaults to Supabase email OTP code entry for MVP.
- New uploads use the V1 path from `docs/BACKEND_CONTRACT_V1.md`.
- `listing` and `thumbnail` photo variants are required for MVP.
- `original` upload is deferred in MVP.
- The browser/PWA camera remains fallback and diagnostic only.
- The first native slice is iPhone-only and portrait-first.
- Manual submit/upload is the MVP default.

Current implementation defaults pending confirmation:

- Native iPhone local state uses Application Support files plus SQLite metadata.
- Owner-scoped schema/path migration is deferred unless explicitly scheduled as backend work.

---

## 5. Mobile Product Role

The iPhone app is a capture + lightweight queue tool.

It is not:

- the final listing workspace
- a full mobile desktop-equivalent dashboard
- a form-heavy inventory system

It should be built around:

- stores
- local capture workflows / queues
- item packets
- photos
- optional item-level metadata
- submit/upload state
- desktop handoff

### 5.1 Core Mobile Rules

- The iPhone app should use a real local multi-item queue.
- The camera should remain central during capture.
- `Next` is the official item boundary.
- The camera screen edits the currently active item packet.
- Store is an item-level property, so one local queue may contain items for multiple stores.
- Photos remain app-local until upload and retention decisions are made.
- Photos should not be saved to the iPhone Camera Roll by default.
- Submit is a deliberate action in MVP.

### 5.2 Deferred Mobile Details

These remain intentionally deferred:

- exact camera screen layout
- exact queue preview UI
- exact store-switch UI
- exact metadata fields
- SKU automation behavior
- exact `Done` behavior
- exact photo cleanup timing
- exact upload confirmation standard
- exact backend batch mapping
- whether reorder / move-between-items is MVP or later

---

## 6. Desktop Product Role

The desktop web app owns:

- review queue
- item detail
- listing workflow
- status updates
- retention visibility
- cleanup controls
- store/batch management

This document intentionally does not expand the desktop workflow beyond what is needed to define the mobile handoff.

---

## 7. Product Workflow

### 7.1 Mobile Capture Workflow

```txt
Open iPhone app
→ sign in if needed
→ choose or confirm capture context
→ open native camera
→ capture photo(s) for current item packet
→ optionally edit details
→ tap Next
→ current item packet is saved into local queue
→ repeat
→ review/edit queue if needed
→ tap Submit
→ app submits eligible unsubmitted item packets
→ local files remain until upload is safely confirmed
→ local files become safe to clean up later
```

### 7.2 Desktop Listing Workflow

```txt
Open desktop web app
→ sign in with same account
→ choose store/batch or current remote scope
→ view unlisted item queue
→ open item detail
→ view photos and metadata
→ manually create eBay listing
→ mark item listed
→ retention window begins
→ later delete remote photos when eligible
```

---

## 8. System Responsibilities

### 8.1 Native iPhone App

Owns:

- native camera capture
- iPhone-local temporary files
- fast item grouping
- local queue persistence
- item metadata capture
- submit/upload queue
- upload verification state
- local safe-to-clear state

Does not own:

- desktop queue management
- eBay listing creation
- pricing/comps research
- team admin
- permanent photo archiving

### 8.2 Web Desktop App

Owns:

- remote queue browsing
- item detail review
- photo viewing
- listing status updates
- retention visibility
- cleanup controls
- store/batch management

### 8.3 Supabase Backend

Owns:

- authentication
- shared backend records for the single-account MVP
- store/batch/item/photo state
- private temporary photo assets
- upload status
- verification status
- retention and deletion state

---

## 9. MVP Scope

### 9.1 iPhone MVP

Must include:

- same-account sign-in
- multi-store support
- native camera preview
- capture photo
- add captured photo to current item packet
- `Next`
- local queue persistence
- optional metadata support
- review/edit before submit
- foreground submit/upload to Supabase
- retry failed uploads
- local file retention until safety is confirmed
- local cleanup option after confirmation

Can defer:

- background upload
- barcode scanning
- automatic SKU increment
- native photo editor
- App Store polish
- exact queue presentation details

### 9.2 Web MVP

Must include:

- same-account sign-in
- remote store/batch selection
- queue sorted with unlisted items first
- item detail with ordered photos
- listing status controls
- retention status display
- manual remote cleanup action
- clear distinction between local, remote, uploaded, verified, deleted

### 9.3 Backend MVP

Must include:

- shared backend tables for the single-account MVP
- private storage bucket
- item/photo status transitions
- upload attempt tracking
- remote ID contract
- photo variant records
- simple retention policy

---

## 10. Photo Storage Philosophy

Photos are temporary handoff assets, not permanent records.

The system only needs photos long enough to:

1. capture them safely
2. keep them safe locally until submit/upload succeeds
3. make them available to the lister
4. allow the lister to complete the manual eBay listing
5. confirm they are no longer needed

Metadata and status should remain longer than image files.
