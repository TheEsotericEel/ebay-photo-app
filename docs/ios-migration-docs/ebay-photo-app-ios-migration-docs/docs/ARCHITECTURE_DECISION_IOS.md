# Architecture Decision: Native iOS Capture + Web Desktop Queue

**Project:** eBay Photo App  
**Status:** Accepted planning decision  
**Date:** 2026-05-21  
**Decision owner:** Joe / The Esoteric Eel

---

## 1. Decision

The project will use a split-client architecture:

> **Native iPhone app for reliable capture and local queue workflow + web app for desktop listing management + shared Supabase backend.**

The current React/Vite app remains valuable, but its long-term production role is the desktop management queue. Browser/PWA capture can remain as a fallback, diagnostic tool, or development path, but it is no longer the primary production iPhone capture strategy.

---

## 2. Reason for the Decision

The product depends on fast, repeated, reliable iPhone photo capture. The browser camera path has shown enough inconsistency that continuing to tune Safari/PWA behavior is the wrong leverage point.

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

The right move is to replace the unreliable mobile camera surface while preserving the desktop management experience and shared backend model.

---

## 3. System Shape After the Decision

```txt
Native iPhone Capture App
  - fast native camera workflow
  - local multi-item queue
  - item packet creation
  - foreground submit/upload to Supabase
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

## 4. Mobile-Specific Product Interpretation

The iPhone app is a capture + lightweight queue tool.

That means:

- the camera remains central during capture
- the local queue is real and durable
- `Next` is the item boundary
- `Submit` is the deliberate MVP handoff action
- the queue may contain items for multiple stores
- the exact backend mapping from local queue to remote `batches` remains deferred

The iPhone app should not become the final listing workspace.

---

## 5. Scope Boundaries

### In Scope Now

- Native iPhone capture client.
- Existing web app as desktop management client.
- Supabase as source of truth for shared state.
- One shared account for MVP.
- Foreground/manual submit/upload first.
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

## 6. Required Pre-Migration Fixes

Before native iPhone starts writing production data, the lifecycle contract must be safe.

### 6.1 Remote Cleanup ID Mapping

Cleanup must use the remote photo ID for Supabase `photos` and `photo_variants`, while using local ID only for local state updates.

### 6.2 Local Cleanup Must Preserve Metadata

Local cleanup must not delete entire photo records if those records are still needed for desktop visibility, upload state, remote cleanup, or auditability.

Required behavior:

```txt
clear local blobs/files
preserve photo metadata
preserve remoteId
preserve upload/remote status
set localStatus = cleared
```

### 6.3 Retention Policy Must Stay Simple

The MVP retention policy should remain:

> Remote photos become eligible for manual deletion 7 days after the item is marked listed.

---

## 7. Accepted Implementation Strategy

1. Freeze this decision in the repo.
2. Fix lifecycle bugs in the current web/Supabase implementation.
3. Define and enforce the backend contract.
4. Convert the web app toward remote desktop management.
5. Build the smallest useful native iPhone capture app.
6. Prove the full loop: native capture -> local queue -> submit/upload -> Supabase -> desktop queue -> listing status -> retention/cleanup.
