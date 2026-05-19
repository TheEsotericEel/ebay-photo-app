# eBay Photo App Migration Documentation Index

**Status:** repo-ready planning package  
**Generated:** 2026-05-19  
**Audit basis:** GitHub `main` after merge commit `676f06dc5e78ee3c9fbbde2f9481bda9e62510b5`  
**Purpose:** organize the migration from PWA-first capture to native iOS capture + web desktop management.

---

## Document Set

| Document | Role | Read Before Coding? |
|---|---|---:|
| `ARCHITECTURE_DECISION_IOS.md` | Locks the decision to split native iOS capture from web desktop management. | Yes |
| `PROJECT_SPEC.md` | Updated product/source-of-truth spec for the new long-term direction. | Yes |
| `BACKEND_CONTRACT.md` | Defines shared data/lifecycle contract between iOS, web, and Supabase. | Yes |
| `IMPLEMENTATION_DECISIONS.md` | Locks the remaining open migration assumptions: auth, storage, variants, and fallback scope. | Yes |
| `FIRST_NATIVE_BUILD_HANDOFF.md` | Single implementation-ready handoff for the first native iOS build. | Yes |
| `IOS_CAPTURE_APP_SPEC.md` | Native iOS capture client requirements and MVP boundary. | Yes |
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

## Current Repo Reality Captured in These Docs

The repo is no longer only a Phase 0 camera spike. Current `main` contains:

- React + Vite + TypeScript app.
- Supabase JS dependency.
- Phase 1 workspace shell.
- Local IndexedDB stores for stores, batches, items, and photos.
- Browser camera adapter and camera test tooling.
- Batch upload path to Supabase tables and private storage.
- Desktop/mobile shell split in `WorkspaceScreen`.
- Listing, upload, retention, and cleanup state concepts.

These docs also capture known migration blockers:

- Remote cleanup currently appears to use local `photo.id` where remote `photo.remoteId` is required.
- Local cleanup currently deletes whole photo records instead of clearing only local blobs while preserving metadata.
- Retention modes are broader than current implementation semantics.
- The web queue currently depends heavily on local IndexedDB state and must become remote-data-ready before native iOS is the primary capture client.

---

## Rules for Future AI IDE Work

AI IDE agents must not:

- Revert to PWA-first capture as the main production path.
- Expand scope into eBay API automation, pricing, AI listing generation, or SaaS/team features.
- Build a full Swift replacement for the desktop queue.
- Add native iOS work before the backend contract and cleanup lifecycle bugs are addressed.
- Delete local photo records as a cleanup strategy unless metadata is preserved somewhere else.

AI IDE agents should:

- Preserve the existing web desktop value.
- Keep Supabase as the shared backend.
- Treat native iOS as a focused capture client.
- Make upload/cleanup state explicit and testable.
- Keep the first native milestone small enough to prove end-to-end handoff.
