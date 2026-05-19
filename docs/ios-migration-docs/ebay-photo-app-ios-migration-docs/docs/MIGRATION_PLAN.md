# Migration Plan: Native iOS Capture + Web Desktop Queue

**Project:** eBay Photo App  
**Status:** implementation sequence for migration  
**Goal:** move production capture from Safari/PWA to native iOS while preserving web desktop management and Supabase backend work.  

---

## 1. Migration Strategy

The migration should be incremental.

Do not stop useful development to perform a full rewrite. Do not start iOS work before the shared data contract is stable enough that both clients can interoperate.

Core strategy:

```txt
Fix lifecycle contract
→ make desktop web remote-data-ready
→ build tiny native iOS capture client
→ prove end-to-end handoff
→ retire PWA camera as primary path
```

### 1.1 Locked Assumptions

The migration now assumes:

- Supabase email OTP is the default auth flow for MVP.
- Native iOS local metadata uses SQLite plus Application Support files.
- New uploads use owner-scoped storage paths.
- `original` and `listing` are required variants; `thumbnail` is best-effort.
- Browser/PWA camera stays fallback and diagnostic only.

---

## 2. Current Risks to Address First

### 2.1 Remote Cleanup ID Bug

Current cleanup code appears to query/update Supabase rows using local `photo.id`, while upload creates remote photo IDs and stores them in `photo.remoteId`.

Risk:

- variants not found
- remote photo rows not marked deleted
- storage objects not removed
- false cleanup success

Required fix:

```txt
Use photo.remoteId for remote Supabase operations.
Use photo.id only for local IndexedDB updates.
```

### 2.2 Local Cleanup Deletes Metadata

Current local cleanup deletes verified local photo records from IndexedDB.

Risk:

- item still references missing photo IDs
- desktop/local queue loses state
- remote cleanup cannot reason about deleted local records
- remote IDs are lost

Required fix:

```txt
Clear local blobs/files only.
Preserve photo metadata and remote IDs.
Set localStatus = cleared.
```

### 2.3 Retention Policy Overbreadth

Current types allow several retention modes, but implementation primarily behaves like listed-date retention.

Risk:

- UI claims policy support that code does not actually implement
- cleanup eligibility is wrong for upload/batch-based modes

Required fix:

```txt
MVP supports only delete_7d_after_listed.
Hide/defer other modes.
```

### 2.4 Desktop Local-State Dependency

Current desktop queue is tied to local IndexedDB state.

Risk:

- iOS-uploaded items do not appear on desktop unless web reads Supabase

Required fix:

```txt
Add remote workspace adapter for desktop queue.
```

---

## 3. Phase 0 — Lock Docs and Contract

### Goal

Make the migration direction explicit and prevent AI/code agents from drifting back to PWA-first assumptions.

### Tasks

- Add `ARCHITECTURE_DECISION_IOS.md`.
- Update `PROJECT_SPEC.md`.
- Add `BACKEND_CONTRACT.md`.
- Add `IOS_CAPTURE_APP_SPEC.md`.
- Add `WEB_DESKTOP_APP_SPEC.md`.
- Add this migration plan.

### Acceptance Criteria

- Docs are committed to repo.
- Docs clearly state native iOS capture is production path.
- Docs clearly state web desktop is management path.
- Docs clearly state Supabase is shared backend.
- Docs list cleanup lifecycle fixes before native migration.

---

## 4. Phase 1 — Fix Existing Lifecycle Bugs

### Goal

Make current web/Supabase lifecycle safe enough to become the shared contract.

### Tasks

#### 1. Fix remote cleanup ID mapping

- In `remoteCleanup.ts`, map eligible photos to `photo.remoteId` for remote operations.
- Skip/block cleanup if a verified local photo has no `remoteId`.
- Query `photo_variants.photo_id` by remote IDs.
- Update `photos.id` by remote ID.
- Update local IndexedDB by local ID.

#### 2. Fix local cleanup

- Make local photo binary fields optional or separable:
  - `blob`
  - `originalBlob`
  - `thumbnailBlob`
- Replace local cleanup delete with metadata-preserving update.
- Add `localStatus='cleared'`.
- Preserve `remoteId`, statuses, dimensions, timestamps.

#### 3. Simplify retention mode behavior

- Keep only `delete_7d_after_listed` visible/active for MVP.
- Remove or hide unsupported retention choices.
- Ensure cleanup eligibility uses `remoteExpiresAt` or item listed date + 7 days.

#### 4. Add tests

Minimum tests:

- remote cleanup uses remote ID when local ID differs
- local cleanup preserves photo metadata
- cleared local photo still appears in item metadata
- remote-deleted photo does not block queue rendering
- retention is blocked before 7-day expiry
- retention is eligible after 7-day expiry

### Acceptance Criteria

- `npm test` passes.
- `npm run build` passes.
- Upload/cleanup tests prove local and remote IDs can differ.
- Local cleanup no longer destroys metadata.

---

## 5. Phase 2 — Stabilize Supabase Schema and Policies

### Goal

Make the backend contract explicit and enforceable before the iOS app writes data.

### Tasks

- Verify existing migrations against `BACKEND_CONTRACT.md`.
- Add missing `owner_id` columns if absent.
- Add required unique constraints:
  - `stores(owner_id, short_code)`
  - `batches(owner_id, store_id, name)`
  - `items(batch_id, sequence)`
  - `photos(item_id, order_index)`
  - `photo_variants(photo_id, variant_type)`
- Confirm RLS is enabled on all public tables.
- Confirm storage bucket is private.
- Confirm storage policies allow authenticated owner-scoped access.
- Decide whether to move storage path to owner-scoped path before iOS upload.

### Acceptance Criteria

- Supabase migrations match backend contract.
- A signed-in user can create/select/update only their own records.
- Storage upload works with anon client + authenticated session.
- Service-role key is not required by client apps.
- Existing web sync still works after schema/policy changes.

---

## 6. Phase 3 — Make Desktop Web Remote-Data-Ready

### Goal

Allow desktop queue to show items uploaded by native iOS.

### Tasks

- Add remote workspace adapter.
- Load stores from Supabase.
- Load batches from Supabase.
- Load items/photos/variants from Supabase.
- Use signed URLs or authenticated downloads for photo display.
- Add remote queue mode behind a flag if needed.
- Preserve legacy IndexedDB mode only as fallback.
- Ensure listing status updates write to Supabase.
- Ensure retention dates write to Supabase.
- Ensure remote cleanup acts on remote IDs.

### Acceptance Criteria

- Desktop queue can render data from Supabase without local IndexedDB photos.
- Desktop item detail can show remote photo variants.
- Mark listed updates remote item.
- Retention date appears after mark listed.
- Remote cleanup is blocked until retention expiry.

---

## 7. Phase 4 — Create Native iOS App Skeleton

### Goal

Create the smallest native iOS app that can authenticate and reach Supabase.

### Tasks

- Add `/ios` project to same repo.
- Add Supabase Swift dependency.
- Add app config for Supabase URL and anon key.
- Add auth screen.
- Implement Supabase email OTP sign-in.
- Add session persistence.
- Add sign out.
- Add minimal home screen showing signed-in state.

### Acceptance Criteria

- iOS app builds in Xcode.
- App signs in on physical iPhone.
- App can read current user/session.
- App can query Supabase stores for the user.
- App survives close/reopen with session intact.

---

## 8. Phase 5 — Native Camera MVP

### Goal

Prove native camera capture reliability on the target iPhone.

### Tasks

- Add camera permission string.
- Build native camera preview.
- Capture high-quality still photo.
- Save captured original to local app storage.
- Show capture result thumbnail.
- Add item session state.
- Add capture -> current item linkage.
- Add `Next Item` and `Done`.
- Add optional metadata form.

### Acceptance Criteria

- Physical iPhone opens camera reliably.
- Camera capture produces usable product photo quality.
- User can capture 3 items without restarting app.
- Local photos persist after app restart.
- Capture flow is faster and more reliable than PWA camera.

---

## 9. Phase 6 — Native Upload MVP

### Goal

Upload native-captured items to the shared Supabase backend.

### Tasks

- Generate or obtain remote IDs.
- Ensure store exists.
- Ensure batch exists.
- Upsert item rows.
- Upsert photo rows.
- Generate listing variant.
- Generate thumbnail variant if feasible.
- Upload storage objects.
- Upsert photo variant rows.
- Mark photos verified.
- Mark item upload state.
- Mark batch upload state.
- Preserve local files until verified.

### Acceptance Criteria

- iOS uploads at least 3 items with photos.
- Failed upload can retry.
- Retry does not duplicate items/photos.
- Remote rows match backend contract.
- Desktop web remote queue shows uploaded items.
- Local files become safe-to-clear only after verification.

---

## 10. Phase 7 — End-to-End Workflow Test

### Goal

Prove the actual user workflow.

### Test Scenario

```txt
1. Sign in on iPhone.
2. Capture 3 items.
3. Upload batch.
4. Open desktop web app.
5. Sign in with same account.
6. Select same store/batch.
7. Confirm 3 items appear.
8. Open item detail.
9. Confirm photos are ordered and visible.
10. Mark one item listed.
11. Confirm retention date appears.
12. Try remote cleanup before retention expires and confirm blocked.
13. Force/test expired retention in dev and confirm cleanup uses remote IDs.
14. Clear local iPhone files after upload and confirm metadata remains.
```

### Acceptance Criteria

- End-to-end flow works without Telegram.
- Desktop queue is useful enough for manual eBay listing.
- iOS capture is reliable enough to continue development.
- No metadata is lost during cleanup.

---

## 11. Phase 8 — De-emphasize PWA Camera

### Goal

Stop spending primary development effort on Safari/PWA camera inconsistencies.

### Tasks

- Label browser camera as fallback/dev mode in docs/UI.
- Keep camera lab only if useful for diagnostics.
- Remove production language that implies PWA camera is primary.
- Keep desktop queue web-first.

### Acceptance Criteria

- Product docs and UI align with native iOS capture plan.
- PWA camera work no longer blocks the project.

---

## 12. CI and Verification

Add or confirm:

- `npm test`
- `npm run build`
- upload/cleanup unit tests
- remote adapter tests with mocked Supabase client
- iOS build verification in Xcode
- physical iPhone manual verification checklist

Potential GitHub Actions workflow:

```yaml
name: web-ci
on: [push, pull_request]
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run build
```

Do not block early migration on iOS CI. Physical device testing matters more for camera validation.

---

## 13. Do Not Do Yet

Do not build these during migration:

- eBay API integration
- AI listing writer
- team permissions
- public SaaS onboarding
- billing/subscriptions
- scheduled background deletion
- native Mac app
- iPad-specific layout
- advanced image editing
- analytics dashboard

---

## 14. Suggested First AI IDE Prompt

```txt
You are working in the ebay-photo-app repo.

Read these docs first:
- docs/ARCHITECTURE_DECISION_IOS.md
- docs/PROJECT_SPEC.md
- docs/BACKEND_CONTRACT.md
- docs/MIGRATION_PLAN.md

Task:
Audit the current code against BACKEND_CONTRACT.md and MIGRATION_PLAN.md Phase 1.
Do not implement native iOS yet.
Identify the smallest code changes needed to:
1. make remote cleanup use remote photo IDs, not local IDs;
2. make local cleanup preserve photo metadata while clearing local blobs/files;
3. constrain MVP retention behavior to delete_7d_after_listed.

Output:
- files that need changes
- exact risk being fixed
- test plan
- then wait for approval before editing
```

---

## 15. Migration Done Criteria

Migration is complete when:

- native iOS is the production capture path
- desktop web reads iOS-uploaded data from Supabase
- PWA camera is fallback/dev-only
- upload state is explicit and reliable
- local cleanup preserves metadata
- remote cleanup uses remote IDs
- simple 7-day-after-listed retention works
- manual eBay listing queue is usable without Telegram
