# eBay Photo App Migration Documentation Index

**Status:** repo-ready planning package  
**Generated:** 05/21/2026  
**Purpose:** organize the migration from PWA-first capture to native iPhone capture + web desktop management.

---

## Must Read Before Coding

| Document | Role |
|---|---|
| `PROJECT_SPEC.md` | Product source-of-truth for current native iPhone + desktop handoff direction. |
| `IMPLEMENTATION_DECISIONS.md` | Locked product decisions plus implementation defaults pending confirmation. |
| `FIRST_NATIVE_BUILD_HANDOFF.md` | Compact implementation handoff for the first native build loop. |
| `IOS_CAPTURE_APP_SPEC.md` | Native iPhone capture requirements and MVP boundaries. |
| `docs/BACKEND_CONTRACT_V1.md` | Canonical V1 submit/upload contract and remote shape. |
| `MIGRATION_PLAN.md` | Ordered implementation sequence and acceptance criteria. |

## Reference Docs

| Document | Role |
|---|---|
| `ARCHITECTURE_DECISION_IOS.md` | Architecture rationale and platform boundary decisions. |
| `WEB_DESKTOP_APP_SPEC.md` | Desktop management requirements and remote-data-first migration target. |
| `BACKEND_CONTRACT.md` | Future-safe backend target (owner-scoped and post-V1 direction). |

## Historical Context

| Document | Role |
|---|---|
| `ebay-photo-handoff-camera-app-official-spec.md` | Historical PWA-first spec superseded for native iPhone planning. |

---

## Recommended Reading Order

1. `ARCHITECTURE_DECISION_IOS.md`
2. `PROJECT_SPEC.md`
3. `docs/BACKEND_CONTRACT_V1.md`
4. `IMPLEMENTATION_DECISIONS.md`
5. `FIRST_NATIVE_BUILD_HANDOFF.md`
6. `MIGRATION_PLAN.md`
7. `IOS_CAPTURE_APP_SPEC.md`
8. `WEB_DESKTOP_APP_SPEC.md`
9. `BACKEND_CONTRACT.md` (future-safe target reference)

---

## Current Mobile Interpretation Captured in These Docs

The current mobile direction is:

- iPhone app = capture + lightweight queue tool
- real local multi-item queue
- `Next` = official item boundary
- `Submit` = deliberate MVP handoff/upload action
- store is an item-level property
- one local queue may contain items from multiple stores
- exact backend batch mapping remains deferred

These docs intentionally preserve desktop guidance where it does not conflict with that mobile direction.

## Canonical V1 Contract Snapshot

- V1 photo variants required for submit/handoff: `listing` + `thumbnail`; `original` upload is deferred.
- MVP auth default: Supabase email OTP code entry; password sign-in is development fallback only for rate-limit recovery.
- V1 storage path contract: `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}`.
- MVP ownership model: one shared account and shared backend records/tables; owner-scoped records and stricter multi-user RLS are deferred.
- Mobile model: local capture workflow/queue with item packets; backend `batches` remain remote schema records; exact local queue-to-batch mapping is deferred.
