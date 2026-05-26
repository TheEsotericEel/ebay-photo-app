> [!WARNING]
> Historical / superseded planning document.
>
> This file is preserved for context only. It is not current implementation authority.
>
> Current authority starts with:
>
> 1. `README.md`
> 2. `docs/ARCHITECTURE_SNAPSHOT.md`
> 3. `docs/FEATURE_SCOPE_LEDGER.md`
> 4. `docs/SUPABASE_SSOT.md`
> 5. `docs/BACKEND_CONTRACT_V1.md`
> 6. `docs/CROSS_PLATFORM_SYNC_CONTRACT.md`
> 7. `docs/WORKSPACE_PHASE1.md`
>
> Do not use this document to override current code, migrations, or active docs.

# eBay Photo App Migration Documentation Index

**Status:** historical planning package
**Generated:** 05/21/2026  
**Purpose:** organize the earlier migration from PWA-first capture to native iPhone capture + web desktop management.

---

## Historical Reference Order

| Document | Role |
|---|---|
| `docs/SUPABASE_SSOT.md` | Architecture and data-ownership reference for the historical migration package. |
| `PROJECT_SPEC.md` | Historical product spec for the native iPhone + desktop handoff direction. |
| `IMPLEMENTATION_DECISIONS.md` | Locked product decisions plus implementation defaults pending confirmation. |
| `FIRST_NATIVE_BUILD_HANDOFF.md` | Compact implementation handoff for the first native build loop. |
| `IOS_CAPTURE_APP_SPEC.md` | Native iPhone capture requirements and MVP boundaries. |
| `docs/BACKEND_CONTRACT_V1.md` | Canonical V1 submit/upload contract and remote shape. |
| `MIGRATION_PLAN.md` | Ordered implementation sequence and acceptance criteria. |

## Historical Reference Docs

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

1. `docs/SUPABASE_SSOT.md`
2. `ARCHITECTURE_DECISION_IOS.md`
3. `PROJECT_SPEC.md`
4. `docs/BACKEND_CONTRACT_V1.md`
5. `IMPLEMENTATION_DECISIONS.md`
6. `FIRST_NATIVE_BUILD_HANDOFF.md`
7. `MIGRATION_PLAN.md`
8. `IOS_CAPTURE_APP_SPEC.md`
9. `WEB_DESKTOP_APP_SPEC.md`
10. `BACKEND_CONTRACT.md` (future-safe target reference)

---

## Current Mobile Interpretation Captured in These Docs

The current mobile direction is:

- iPhone app = capture + lightweight queue tool
- real local multi-item queue
- `Next / Finish Item` = official item boundary checkpoint
- `Queue & Continue` finalizes the current draft into a queued item packet
- if the current draft has captured photos, `Done` routes through the same checkpoint so the user can choose `Queue & Exit` or return to camera
- `Submit` = deliberate MVP handoff/upload action for finalized queued item packets
- store is an item-level property
- one local queue may contain items from multiple stores
- exact backend batch mapping remains deferred

These docs intentionally preserve desktop guidance where it does not conflict with that mobile direction.

## Canonical V1 Contract Snapshot

- V1 photo variants required for submit/handoff: `listing` + `thumbnail`; `original` upload is deferred.
- MVP auth default: Supabase email OTP code entry; password sign-in is development fallback only for rate-limit recovery.
- V1 storage path contract: `{storeId}/batches/{batchId}/items/{itemId}/photos/{photoId}/{variant}`.
- MVP ownership model: one shared account and shared backend records/tables; owner-scoped records and stricter multi-user RLS are deferred.
- Mobile model: local capture workflow/queue with item packets; the Finish Item checkpoint defines item boundaries; backend `batches` remain remote schema records; exact local queue-to-batch mapping is deferred.
