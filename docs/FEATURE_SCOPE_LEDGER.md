# Feature Scope Ledger
**Status:** Feature and scope authority
**Last updated:** 2026-05-23
**Purpose:** Classify current, MVP, foundational, future, research, non-goal, and historical features so agents do not overbuild, underbuild, or code into known future dead ends.

This file is not a task backlog. It is a scope-control document.

For current architecture, see:

- [`docs/ARCHITECTURE_SNAPSHOT.md`](ARCHITECTURE_SNAPSHOT.md)

---

## 1. How To Read This File

The project uses a strict MVP mindset, but MVP does not mean hard-coding temporary assumptions that block known future needs.

Use this file to decide:

- what may be changed now
- what should be preserved as an architectural seam
- what should not be implemented yet
- what is historical and should not be revived accidentally

---

## 2. Scope Labels

### Current

Implemented or actively present in code.

Agent rule:

- May modify when directly relevant to the task.
- Must preserve current behavior unless the task explicitly changes it.

### MVP Required

Needed for the practical MVP workflow.

Agent rule:

- May implement or fix now when part of the active task.
- Prefer the simplest reliable version.

### MVP Foundation

Not necessarily full UI now, but the architecture must preserve and support it.

Agent rule:

- Do not build the full feature unless tasked.
- Do preserve clean seams and avoid assumptions that contradict it.

### MVP Required Before Public Release

Not required for every local dev slice, but required before a real public or App Store-style release.

Agent rule:

- Do not ignore when touching related systems.
- Do not accidentally make this harder.

### Post-MVP Planned

A valid future feature, but not part of the current MVP build.

Agent rule:

- Do not implement unless explicitly tasked.
- May preserve cheap compatibility when already touching nearby code.

### Research / Maybe

Interesting but not committed.

Agent rule:

- Do not implement.
- Do not add abstractions solely for it.
- Only keep data clean enough that it remains possible later.

### Explicit Non-Goal

Forbidden unless product direction changes.

Agent rule:

- Do not implement.
- Do not add scaffolding.

### Historical / Superseded

Old approach retained for context only.

Agent rule:

- Do not use as current product direction.
- Do not revive unless explicitly requested.

---

## 3. Global Agent Rules

### Do

- Prefer current code and migrations over old docs.
- Keep native iOS as the primary capture path.
- Keep desktop as the listing and review surface.
- Keep Supabase as shared durable state after `Submit` or `flush`.
- Keep device-local state valid before `Submit` or `flush`.
- Preserve workspace ownership.
- Preserve item and photo ordering.
- Preserve store, batch, item, and photo boundaries.
- Preserve remote IDs once assigned.
- Keep `listing` and `thumbnail` variants available for desktop and eBay handoff.
- Treat `original` photo upload as optional.
- Keep docs explicit about what is current versus future.

### Do not

- Reintroduce the single shared global account model.
- Reintroduce permissive authenticated-user RLS.
- Treat old PWA/browser-camera docs as current architecture.
- Treat “post-MVP” as forbidden product direction.
- Treat “MVP Foundation” as permission to build the full future UI.
- Build eBay API automation unless explicitly tasked.
- Build AI listing generation unless explicitly tasked.
- Add team or billing complexity to current MVP tasks.
- Replace the current local queue model with immediate-upload-only behavior.
- Assume desktop is fully remote-first.

---

## 4. Capture

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Native iOS camera capture | Current | Primary capture path. | Preserve. |
| AVFoundation camera service | Current | Native iOS camera service. | Modify only when a camera task requires it. |
| Square deliverables | Current | Default capture/output mode. | Preserve as default. |
| Native aspect mode | Current / limited | Exists in code but square is default. | Do not make native default without an explicit task. |
| JPEG orientation baked into pixels | Current | Required for desktop and eBay reliability. | Preserve. |
| `.5` / `1x` lens modes | Current | Supported lens presets. | Preserve. |
| Auto / locked lens behavior | Current | Lens switching mode exists. | Preserve. |
| Zoom | Current | Per-lens zoom is persisted. | Preserve. |
| Tap focus / exposure | Current | Supported where device allows it. | Preserve. |
| Capture loop / fast repeated capture | Current | Supports pending captures. | Preserve. |
| Grid / horizon guide toggles | Current | Available in camera UI. | Preserve unless a UI task changes it. |
| Torch | Research / verify | Not confirmed in this pass. | Do not document as current until verified. |
| Telephoto | Research / maybe | Not current target. | Do not implement unless explicitly tasked. |
| Manual ISO / shutter / white balance | Research / maybe | Not current target. | Do not implement unless explicitly tasked. |
| Full pro camera mode | Research / maybe | Not current target. | Do not build. |
| Browser/PWA camera as primary capture | Historical / superseded | Old Phase 0 path. | Do not use as current architecture. |

---

## 5. Local iOS Queue

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Current draft item | Current | iOS stores active photos and metadata before queueing. | Preserve. |
| `Next` as checkpoint opener | Current | Camera Next opens `ItemDetailsScreen`; `ItemDetailsScreen` `Save & Next` finalizes the current draft, queues it, and returns to camera. | Preserve. |
| Local multi-item queue | Current | Queued item packets exist. | Preserve. |
| Queue persistence | Current | Queue state and photo files persist in app storage. | Preserve. |
| Store assignment per queued item | Current | Queued item stores store and batch context. | Preserve. |
| SKU field | Current | Stored locally and submitted. | Preserve. |
| Weight field | Current | Stored locally and submitted. | Preserve. |
| Dimensions field | Current | Stored locally and submitted. | Preserve. |
| Notes field | Current | Stored locally and submitted. | Preserve. |
| Queue review | Current | Queue review sheet exists. | Preserve. |
| Edit queued metadata | Current | Queue item editor supports metadata edits. | Preserve. |
| Edit queued store/batch assignment | Current | Queue item editor supports store/batch edits. | Preserve. |
| Remove queued photo | Current | Supported. | Preserve. |
| Delete queued item locally | Current | Supported. | Preserve. |
| Resume queued item in camera | Current | Supported. | Preserve. |
| Mark submitted item for resubmit | Current | Supported. | Preserve. |
| Clear safe local photo copies | Current | Supported after safe upload/submission state. | Preserve. |
| Reorder photos inside item | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Reorder queued items | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Move photo between items | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Auto-increment SKU | Post-MVP Planned | Desired later. | Preserve simple item-number/store/batch seams; do not build yet. |
| Barcode / ISBN lookup | Research / maybe | Not current. | Do not implement unless tasked. |

---

## 6. Submit, Upload, And Sync

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Explicit `Submit` | Current | User submits queued items deliberately. | Preserve. |
| Submit eligible queued items | Current | Local and failed items with photos are eligible. | Preserve. |
| Retry failed items | Current / limited | Failed items can become eligible again. | Preserve; improve only when tasked. |
| Upload progress state | Current | Per-item and per-photo progress exists. | Preserve. |
| Listing variant upload | Current | Required for desktop and eBay handoff. | Preserve. |
| Thumbnail variant upload | Current | Required for preview and desktop flow. | Preserve. |
| Original variant upload | Current / optional | May be included when available. | Do not require original for V1 flow. |
| iOS workspace snapshot polling | Current | iOS polls remote workspace snapshot. | Preserve unless a sync task changes it. |
| Desktop workspace sync | Current | Push/pull bridge exists. | Preserve. |
| Desktop batch delta import | Current | Imports remote items and photos. | Preserve. |
| Desktop item mutation queue | Current | Local item edits queued and flushed to remote. | Preserve. |
| Realtime as refresh trigger | Current / limited | Desktop uses realtime item-change poke. | Do not treat as primary sync model yet. |
| Polling sync | Current | Desktop and iOS use polling loops. | Preserve until replacement is explicitly designed. |
| Full offline conflict resolution | MVP Foundation | Not complete. | Avoid assumptions that prevent it later. |
| Background iOS upload | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Background desktop sync worker | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Realtime as primary sync architecture | Research / maybe | Not current. | Do not refactor into this unless tasked. |

---

## 7. Desktop Lister

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Desktop web lister entrypoint | Current | App renders desktop lister. | Preserve. |
| Supabase sign-in | Current | OTP and password fallback. | Preserve. |
| Local IndexedDB working copy | Current | Stores, batches, items, and photos cached locally. | Preserve. |
| Store selection | Current | Store cards. | Preserve. |
| Active batch queue | Current / limited | Uses active or latest batch. | Preserve; polish later. |
| Item cards | Current | Shows listing queue. | Preserve. |
| Item detail modal | Current | Shows photos, metadata, and actions. | Preserve. |
| Ordered photo preview | Current | Item photo order is displayed. | Preserve. |
| Metadata readout | Current | SKU, weight, dimensions, notes. | Preserve. |
| Listing status controls | Current | `new` / to list, `listed`, `hold`, `needs retake`. | Preserve. |
| Hide completed listed items from active queue | Current | Listed items are hidden from active list. | Preserve unless a listing-queue task changes it. |
| Drag ordered photos to eBay | Current / experimental | Manual handoff to eBay uploader. | Preserve item-scoped ordered photo export. |
| Copy-friendly listing block | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Advanced search/filter | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Rich batch/store admin | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Multi-user desktop collaboration | Post-MVP Planned | Not current. | Do not implement unless tasked. |

---

## 8. Backend, Account, And Workspace

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Supabase backend | Current | Shared backend. | Preserve. |
| Supabase Auth | Current | OTP and password paths. | Preserve. |
| Password fallback | Current / dev-practical | Used when OTP is blocked. | Preserve unless an auth task changes it. |
| Single-user workspace | Current / MVP foundation | User is provisioned into a workspace. | Preserve. |
| Workspace-owned rows | Current | Business rows include `workspace_id`. | Preserve. |
| Membership RLS | Current | Workspace-member policies exist. | Preserve. |
| Parent-chain workspace integrity | Current | Composite constraints exist. | Preserve. |
| Store short code scoped by workspace | Current | Store uniqueness scoped to workspace. | Preserve. |
| Default workspace / store / batch provisioning | Current | Provisioning RPC and trigger exist. | Preserve. |
| Team invites | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Roles beyond owner | Post-MVP Planned | Not current. | Do not implement unless tasked. |
| Billing / entitlements | Post-MVP Planned | Strategic only. | Do not implement unless tasked. |
| App Store review / demo account readiness | MVP required before public release | Not fully documented. | Preserve path; do not block account deletion / demo readiness. |
| Account deletion path | MVP required before public release | Not current. | Required before public release if accounts are created in app. |

---

## 9. Storage, Retention, Cleanup, And Delete

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| `photo-assets` bucket | Current | Shared storage bucket. | Preserve. |
| Store/batch/item/photo storage paths | Current | Current implemented path shape. | Preserve until migration is explicitly planned. |
| Listing variant storage | Current | Required. | Preserve. |
| Thumbnail variant storage | Current | Required. | Preserve. |
| Optional original storage | Current / optional | May exist. | Do not make required. |
| Photo retention fields | Current | Used for cleanup timing. | Preserve. |
| Safe local cleanup | Current | User-initiated only; clears local copies only for submitted items that are already safe to discard. | Preserve. |
| Retention-based remote photo cleanup | Current / limited | Deletes eligible storage objects and marks photo state. | Preserve. |
| Tombstone-first entity delete | MVP foundation | Not current. | Do not add hard-delete assumptions that block it. |
| Production-safe delete model | MVP required before public release | Not current. | Required before public release. |
| Workspace-prefixed storage paths | MVP required before public release | Not current. | Do not make new storage assumptions that fight this. |
| Storage RLS / path hardening | MVP required before public release | Not fully current. | Required before public release. |
| Hard purge of stores/batches/items | Post-MVP planned / system cleanup | Not current user-facing model. | Do not implement as default delete behavior. |

---

## 10. Integrations And Listing Assistance

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Manual eBay handoff | Current | Drag ordered photos to eBay. | Preserve. |
| Store / folder / queue organization | Current | Stores organize lister work. | Preserve. |
| eBay store API integration | Research / maybe | Not current. | Do not implement unless tasked. |
| eBay listing API creation | Research / maybe | Not current. | Do not implement unless tasked. |
| Chrome extension / eBay page helper | Post-MVP planned | Desired later. | Do not implement now; preserve clean item, photo, and metadata boundaries. |
| Pop-out / overlay listing helper | Post-MVP planned | Desired later. | Do not implement now. |
| Copy-to-field helper UI | Post-MVP planned | Not current. | Do not implement unless tasked. |
| AI listing generation | Research / maybe | Not current. | Do not implement unless tasked. |
| AI title / item-specific suggestions | Research / maybe | Not current. | Keep metadata clean enough to support later. |

---

## 11. Release, Public MVP, And Productization

| Feature | Scope | Current handling | Agent rule |
| --- | --- | --- | --- |
| Local/private MVP workflow | Current | Built around single-user workflow. | Preserve. |
| Publishable account / workspace foundation | MVP foundation | Workspace model exists. | Continue aligning with this. |
| Public-release storage hardening | MVP required before public release | Not done. | Required before public release. |
| Public-release delete/account readiness | MVP required before public release | Not done. | Required before public release. |
| App Store polish / checklist | Post-MVP planned / before release | Not current implementation focus. | Do not overbuild during local MVP tasks. |
| Multi-tenant SaaS | Post-MVP planned | Strategic only. | Do not implement now. |
| Payments / billing | Post-MVP planned | Strategic only. | Do not implement now. |

---

## 12. Explicit Non-Goals For Current MVP

These are not current MVP work:

- Full eBay automation platform.
- Automatic eBay listing creation.
- Multi-user team dashboard.
- Billing or subscriptions.
- Enterprise permissions.
- Full pro camera app.
- PWA or browser camera as the main production capture path.
- General AI listing system.
- Large no-code workflow builder.
- Multi-marketplace crosslister.

These may be revisited later only if explicitly tasked.

---

## 13. Historical / Superseded

| Feature or assumption | Status | Replacement |
| --- | --- | --- |
| PWA-first mobile camera | Historical / superseded | Native iOS camera. |
| Browser camera as production path | Historical / superseded | Native iOS capture. |
| Single shared global account | Historical / superseded | Single-user workspace per account. |
| Permissive authenticated-user RLS | Historical / superseded | Workspace membership RLS. |
| Owner/workspace/RLS as purely future | Historical / superseded | Workspace and RLS are now implemented. |
| Migration-doc package as active coding source | Historical / superseded | Current README, architecture snapshot, feature ledger, SSOT, backend contract. |
| Phase 0 browser-camera testing as current product doc | Historical / superseded | Keep only as browser camera diagnostic reference. |

---

## 14. Wording Rules For Future Docs And Prompts

Use this wording:

`MVP Foundation` means preserve the architecture seam, not build the full UI now.

Use this wording:

`Post-MVP Planned` means valid future direction, but not current implementation work.

Use this wording:

`Do not implement the full feature now, but do not make choices that block it later.`

Avoid this wording:

`Deferred, ignore completely.`

Avoid this wording:

`Non-goal.`

unless the feature is truly an explicit non-goal.

Prefer:

- Not current MVP work.
- Preserve the seam.
- Do not build full UI unless explicitly tasked.

---

## 15. Known Classification Questions

These are intentionally left visible for future decisions.

| Question | Current default |
| --- | --- |
| Should photo/item reorder move into MVP Required? | No. Post-MVP Planned unless testing shows it is necessary. |
| Should Chrome extension helper be planned or research? | Post-MVP Planned. |
| Should eBay API integration be planned or research? | Research / maybe. |
| Should AI listing helper be planned or research? | Research / maybe. |
| Should workspace-prefixed storage paths be required before public release? | Yes. |
| Should tombstone delete be required before public release? | Yes. |
| Should original upload be required? | No. `listing` and `thumbnail` are required; `original` is optional. |
