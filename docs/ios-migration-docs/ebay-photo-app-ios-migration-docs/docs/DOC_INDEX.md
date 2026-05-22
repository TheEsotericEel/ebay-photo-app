# eBay Photo App Migration Documentation Index

**Status:** repo-ready planning package  
**Generated:** 2026-05-21  
**Purpose:** organize the migration from PWA-first capture to native iPhone capture + web desktop management.

---

## Document Set

| Document | Role | Read Before Coding? |
|---|---|---:|
| `ARCHITECTURE_DECISION_IOS.md` | Locks the decision to split native iPhone capture from web desktop management. | Yes |
| `PROJECT_SPEC.md` | Updated product/source-of-truth spec for the current mobile-first handoff direction. | Yes |
| `BACKEND_CONTRACT.md` | Defines shared data/lifecycle contract between iPhone, web, and Supabase. | Yes |
| `IMPLEMENTATION_DECISIONS.md` | Locks the remaining open migration assumptions without over-locking deferred details. | Yes |
| `FIRST_NATIVE_BUILD_HANDOFF.md` | Single implementation-ready handoff for the current native iPhone build direction. | Yes |
| `IOS_CAPTURE_APP_SPEC.md` | Native iPhone capture client requirements and MVP boundary. | Yes |
| `WEB_DESKTOP_APP_SPEC.md` | Web desktop management app requirements and migration target. | Yes |
| `MIGRATION_PLAN.md` | Ordered implementation sequence, acceptance criteria, and risk controls. | Yes |

---

## Recommended Reading Order

1. `ARCHITECTURE_DECISION_IOS.md`
2. `PROJECT_SPEC.md`
3. `BACKEND_CONTRACT.md`
4. `IMPLEMENTATION_DECISIONS.md`
5. `FIRST_NATIVE_BUILD_HANDOFF.md`
6. `MIGRATION_PLAN.md`
7. `IOS_CAPTURE_APP_SPEC.md`
8. `WEB_DESKTOP_APP_SPEC.md`

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
