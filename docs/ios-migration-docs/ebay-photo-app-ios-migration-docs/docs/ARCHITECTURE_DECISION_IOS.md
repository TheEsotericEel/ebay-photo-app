# Architecture Decision: Native iOS Capture + Web Desktop Queue

**Project:** eBay Photo App  
**Status:** Accepted planning decision  
**Date:** 2026-05-19  
**Decision owner:** Joe / The Esoteric Eel  
**Repo audit basis:** `TheEsotericEel/ebay-photo-app`, `main`, merge commit `676f06dc5e78ee3c9fbbde2f9481bda9e62510b5`  

---

## 1. Decision

The project will move from a PWA-first camera workflow to a split-client architecture:

> **Native iOS app for reliable item/photo capture + web app for desktop listing management + shared Supabase backend.**

The current React/Vite app remains valuable, but its long-term production role becomes the desktop management queue. Browser/PWA capture can remain as a fallback, diagnostic tool, or development path, but it is no longer the primary production iPhone capture strategy.

---

## 2. Reason for the Decision

The product depends on fast, repeated, reliable iPhone photo capture. The current PWA/Safari camera path has shown enough inconsistency that continuing to tune browser camera behavior risks wasting time on the weakest layer of the workflow.

The repo already contains substantial useful work outside the camera problem:

- item packets
- store and batch context
- local workflow state
- Supabase upload concepts
- photo variants
- listing status
- retention and cleanup state
- desktop/mobile shell split
- queue-oriented management concepts

The failure point is not the whole application. The failure point is relying on mobile browser camera APIs for the core capture experience.

A native iOS capture app directly addresses that risk while preserving the existing web/Supabase work.

---

## 3. System Shape After the Decision

```txt
Native iOS Capture App
  - fast native camera workflow
  - local temporary file storage
  - item packet creation
  - foreground upload to Supabase
  - local safe-to-clear state

Web Desktop Management App
  - store/batch/item queue
  - photo review
  - copy/listing workflow support
  - listing status controls
  - retention and cleanup visibility

Shared Supabase Backend
  - Auth
  - Postgres records
  - private photo-assets bucket
  - upload verification state
  - retention and cleanup state
```

---

## 4. Why Not a Full Rewrite

A full rewrite would increase scope without fixing the real problem proportionally.

The web app already provides a useful management surface. Rebuilding that in Swift would add work that does not improve the capture bottleneck. The right migration is to replace the unreliable mobile camera surface while preserving the desktop management experience and shared backend model.

---

## 5. Why Not Capacitor-Only

A Capacitor wrapper around the current web app would reduce deployment friction, but it would still rely heavily on webview behavior unless the camera layer is replaced with a native camera plugin or custom native camera screen.

The project can still use Capacitor as an intermediate bridge if desired, but the strategic decision is native capture, not webview capture.

Recommended default:

- Do not start with a plain wrapper as the final plan.
- Use either a focused native Swift app or a native camera surface that writes to the same Supabase contract.
- Prefer pure Swift/SwiftUI + AVFoundation if camera reliability is the core reason for migration.

---

## 6. Long-Term Direction

The long-term architecture should support:

- reliable iPhone capture
- desktop listing workflow
- one shared backend contract
- temporary photo handoff storage
- future expansion if useful

It should not prematurely support:

- team permissions
- multiple account roles
- eBay API integration
- SaaS billing
- native desktop app
- AI listing generation
- permanent archive/inventory system

The architecture should be durable at the seams without overbuilding the product.

---

## 7. Scope Boundaries

### In Scope Now

- Native iOS capture client.
- Existing web app as desktop management client.
- Supabase as source of truth for shared state.
- One shared account for MVP.
- Foreground/manual upload first.
- Manual remote cleanup first.
- Temporary remote photo retention.

### Out of Scope Now

- Multi-user/team auth.
- Separate photographer/lister accounts.
- eBay API listing creation.
- Automated pricing or comps research.
- AI listing writer.
- Background upload as the first implementation.
- Scheduled automatic deletion as the first implementation.
- Native Mac/iPad-specific app.
- Public SaaS onboarding.

---

## 8. Required Pre-Migration Fixes

Before native iOS starts writing production data, the existing lifecycle contract must be corrected.

### 8.1 Remote Cleanup ID Mapping

Current upload flow creates and uses a remote photo ID. Local `photo.id` and remote `photo.remoteId` can differ. Cleanup must use the remote ID for Supabase `photos` and `photo_variants`, while using local ID only for local IndexedDB updates.

Required invariant:

```txt
Supabase photos.id == StoredPhoto.remoteId
Supabase photo_variants.photo_id == StoredPhoto.remoteId
Local IndexedDB photo key == StoredPhoto.id
```

### 8.2 Local Cleanup Must Preserve Metadata

Local cleanup must not delete entire photo records if those records are still needed for desktop visibility, upload state, remote cleanup, or auditability.

Required behavior:

```txt
clear local blobs/files
preserve photo metadata
preserve remoteId
preserve upload/remote status
set localStatus = cleared
```

### 8.3 Retention Policy Must Be Simplified

The MVP retention policy should be exactly:

> Remote photos become eligible for manual deletion 7 days after the item is marked listed.

Other retention modes can remain deferred until their timestamp basis is implemented.

---

## 9. Consequences

### Positive

- Native iOS can use stable platform camera APIs.
- Existing web work is preserved.
- Supabase remains the shared integration point.
- Migration can happen in slices.
- Desktop management does not need to wait for native polish.

### Negative / Cost

- A second client must be maintained.
- Shared backend contract must be stricter.
- Auth/deep-link handling must be implemented for native iOS.
- Image variant generation must be implemented outside the current browser canvas pipeline.
- The web app must become remote-data-ready for items captured from iOS.

---

## 10. Accepted Implementation Strategy

1. Freeze this decision in the repo.
2. Fix lifecycle bugs in the current web/Supabase implementation.
3. Define and enforce the backend contract.
4. Convert the web app toward remote desktop management.
5. Build the smallest useful native iOS capture app.
6. Prove the full loop: native capture -> Supabase -> desktop queue -> listing status -> retention/cleanup.

---

## 12. Implementation Decisions Now Locked

The remaining gap decisions have been resolved in `IMPLEMENTATION_DECISIONS.md`:

- Supabase email OTP is the default auth flow for MVP.
- Native iOS local state uses Application Support files plus SQLite metadata.
- New uploads use owner-scoped storage paths.
- `original` and `listing` variants are required; `thumbnail` is best-effort.
- Browser/PWA camera remains fallback/diagnostic only.

These defaults are part of the accepted migration shape and should not be reopened unless the product direction changes.

---

## 13. References

- Apple AVFoundation documentation: https://developer.apple.com/documentation/avfoundation
- Apple `AVCapturePhotoOutput`: https://developer.apple.com/documentation/avfoundation/avcapturephotooutput
- Apple `NSCameraUsageDescription`: https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription
- Supabase Swift reference: https://supabase.com/docs/reference/swift/introduction
- Supabase native mobile deep linking: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
