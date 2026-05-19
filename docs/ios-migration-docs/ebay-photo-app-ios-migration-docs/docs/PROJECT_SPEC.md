# eBay Photo App — Updated Project Spec

**Status:** source-of-truth product spec for the iOS migration direction  
**Current direction:** native iOS capture app + web desktop management app + shared Supabase backend  
**Repo audit basis:** `TheEsotericEel/ebay-photo-app`, `main`, after merge commit `676f06dc5e78ee3c9fbbde2f9481bda9e62510b5`  
**Primary goal:** replace the Telegram-based photo handoff workflow with a fast, item-aware capture and desktop listing queue.  
**Primary non-goal:** this is not an eBay automation platform, AI listing writer, pricing tool, permanent inventory system, or SaaS-first product.

---

## 1. Product Definition

A native iPhone capture app and web desktop management app for eBay listing workflows.

The system captures item photos into clearly separated item packets, optionally attaches lightweight metadata, uploads those packets to temporary remote storage, and gives the desktop lister a clean queue for manual eBay listing and checkoff.

The product should feel like:

```txt
Take photos fast on iPhone.
Group them correctly by item.
Upload them safely.
Open desktop queue.
List manually on eBay.
Mark item listed.
Delete photos after they are no longer needed.
```

---

## 2. Architecture Decision

The production mobile capture path is native iOS.

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

---

## 3.1 Implementation Defaults

The migration assumptions that were previously open are now locked:

- Auth defaults to Supabase email OTP code entry for MVP.
- Native iOS local state uses Application Support files plus SQLite metadata.
- New uploads use owner-scoped storage paths.
- `original` and `listing` photo variants are required for MVP.
- `thumbnail` is strongly recommended and should be generated when feasible.
- The browser/PWA camera remains fallback and diagnostic only.
- The first native slice is iPhone-only and portrait-first.

### 3.2 Photographer

The person using the iPhone to capture item photos.

For MVP, this is the same person/account as the lister.

Needs:

- open camera quickly
- capture multiple photos per item
- move to next item with almost no friction
- optionally enter SKU, weight, dimensions, and notes
- upload the batch
- clear local phone files only after upload is verified

### 3.3 Lister

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

## 4. Current Repo State Considered

The current repo already includes:

- React + Vite + TypeScript web app.
- Supabase JS dependency.
- Supabase client config gated by environment variables.
- Phase 1 `WorkspaceScreen` that owns mobile and desktop shell state.
- Browser camera adapter and camera lab/test tooling.
- IndexedDB stores for local stores, batches, items, and photos.
- Store/batch/item packet concepts.
- Listing status: `new`, `listed`, `hold`, `needs_retake`.
- Upload status and remote status concepts.
- Photo variants: original, listing, thumbnail.
- Supabase upload path for batch sync.
- Remote cleanup and retention concepts.

Known issues that must influence migration:

- Remote cleanup must use `photo.remoteId` for Supabase rows, not local `photo.id`.
- Local cleanup must preserve metadata rather than deleting whole records.
- Retention modes are broader than their implemented timestamp semantics.
- The desktop queue currently depends heavily on local IndexedDB state and must become remote-data-ready.

---

## 5. Product Workflow

### 5.1 Capture Workflow

```txt
Open iOS app
→ sign in if needed
→ choose active store/batch or use defaults
→ open native camera
→ capture photo(s) for current item
→ optionally edit details
→ tap Next Item
→ repeat
→ tap Done or Upload Batch
→ app uploads to Supabase
→ local files remain until upload is verified
→ local files become safe to clear
```

### 5.2 Desktop Listing Workflow

```txt
Open desktop web app
→ sign in with same account
→ choose store/batch
→ view unlisted item queue
→ open item detail
→ view photos and metadata
→ manually create eBay listing
→ mark item listed
→ retention window begins
→ later delete remote photos when eligible
```

---

## 6. System Responsibilities

### 6.1 Native iOS App

Owns:

- native camera capture
- iPhone-local temporary files
- fast item grouping
- item metadata capture
- upload queue
- upload verification state
- local safe-to-clear state

Does not own:

- desktop queue management
- eBay listing creation
- pricing/comps research
- team admin
- permanent photo archiving

### 6.2 Web Desktop App

Owns:

- remote queue browsing
- item detail review
- photo viewing
- listing status updates
- retention visibility
- cleanup controls
- store/batch management

Does not own:

- production iPhone camera reliability
- local iPhone file storage
- native camera/lens control

### 6.3 Supabase Backend

Owns:

- authentication
- user-owned records
- store/batch/item/photo state
- private temporary photo assets
- upload status
- verification status
- retention and deletion state

---

## 7. MVP Scope

### 7.1 iOS MVP

Must include:

- same-account sign-in
- store/batch selection or defaults
- native camera preview
- capture photo
- add captured photo to current item
- next item
- done session
- optional metadata: SKU, weight, dimensions, notes
- foreground upload to Supabase
- retry failed uploads
- local file retention until verification
- local cleanup after verification

Can defer:

- background upload
- barcode scanning
- automatic SKU increment
- multi-batch advanced management
- native photo editor
- App Store polish

### 7.2 Web MVP

Must include:

- same-account sign-in
- remote store/batch selection
- queue sorted with unlisted items first
- item detail with ordered photos
- listing status controls
- retention status display
- manual remote cleanup action
- clear distinction between local, remote, uploaded, verified, deleted

Can defer:

- real-time subscriptions
- multi-user permissions
- bulk edit workflows
- advanced dashboards
- eBay API sync

### 7.3 Backend MVP

Must include:

- user-owned tables
- private storage bucket
- storage paths that can be tied to owner/user identity
- item/photo status transitions
- upload attempt tracking
- remote ID contract
- photo variant records
- simple retention policy

---

## 8. Canonical MVP Retention Policy

Use one retention policy first:

> Remote photos become eligible for manual deletion 7 days after the item is marked listed.

Do not implement multiple automatic deletion policies until the simple listed-item policy is proven.

Manual deletion should remain the first cleanup mechanism.

---

## 9. Photo Storage Philosophy

Photos are temporary handoff assets, not permanent records.

The system only needs photos long enough to:

1. capture them safely
2. upload them successfully
3. make them available to the lister
4. allow the lister to complete the manual eBay listing
5. confirm they are no longer needed

Metadata and status should remain longer than image files.

---

## 10. Data Model Summary

Canonical domain objects:

- `Store`
- `Batch`
- `Item`
- `Photo`
- `PhotoVariant`
- `UploadJob` or upload-attempt state

Canonical status concepts:

- item capture status
- listing status
- photo local status
- photo upload status
- photo remote status
- retention status

Detailed field definitions live in `BACKEND_CONTRACT.md`.

---

## 11. Local vs Remote Source of Truth

### Native iOS local state

Temporary and operational.

Used for:

- camera session
- local files
- upload retries
- safe-to-clear tracking

### Supabase remote state

Shared source of truth.

Used for:

- desktop queue
- item listing status
- remote upload status
- retention and cleanup state

### Web local IndexedDB

During migration, web IndexedDB may remain for legacy/capture fallback. Long-term desktop management must read remote Supabase data for items captured on iOS.

---

## 12. Acceptance Criteria for First Real Native Slice

The first native slice is accepted when this loop works:

```txt
iPhone native app signs in
→ captures 3 items with multiple photos
→ uploads them to Supabase
→ desktop web app shows the same store/batch/items/photos
→ lister marks one item listed
→ retention date appears
→ local iPhone files can be marked safe-to-clear
→ remote cleanup is blocked until retention expires
```

---

## 13. Non-Goals

Out of scope until the core handoff loop is proven:

- eBay API listing creation
- eBay status sync
- pricing research
- AI listing generation
- public SaaS onboarding
- subscriptions/billing
- team accounts
- separate photographer/lister permissions
- permanent photo archive
- full inventory management
- accounting/bookkeeping
- native Mac app
- native iPad custom UI
- complex offline conflict resolution

---

## 14. Future Expansion Boundaries

Future expansion is allowed only after MVP proof.

Potential later features:

- barcode/ISBN scan
- SKU auto-increment
- batch templates
- retake requests from desktop to phone
- limited team mode
- scheduled cleanup automation
- lightweight eBay API status sync

These must not affect the MVP architecture unless they are cheap seams, not full implementations.

---

## 15. Required Documentation Set

This spec is supported by:

- `ARCHITECTURE_DECISION_IOS.md`
- `BACKEND_CONTRACT.md`
- `IOS_CAPTURE_APP_SPEC.md`
- `WEB_DESKTOP_APP_SPEC.md`
- `MIGRATION_PLAN.md`

Future code agents must read these before changing architecture.

---

## 16. References

- Apple AVFoundation: https://developer.apple.com/documentation/avfoundation
- Apple `AVCapturePhotoOutput`: https://developer.apple.com/documentation/avfoundation/avcapturephotooutput
- Supabase Swift reference: https://supabase.com/docs/reference/swift/introduction
- Supabase native mobile deep linking: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
