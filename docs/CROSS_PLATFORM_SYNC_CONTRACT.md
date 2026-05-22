# Cross-Platform Sync Contract

**Status**: Working draft
**Last updated**: 2026-05-21
**Purpose**: Define how desktop and mobile synchronize without per-item polling, and clarify which platform owns which data and actions.

This document is the shared reference for future sync decisions. It is intentionally scoped to the current product shape:
- `mobile` means the iOS app, phone app, or capture app
- `desktop` means the site, desktop app, or PC web app

This contract is intentionally high-level. It should not be used to prematurely lock:

- exact mobile queue UI
- exact desktop workflow UI
- exact backend batch mapping for the mobile local queue
- exact `Done` semantics on mobile

## 0. Data Ownership Rule

Use this ownership model throughout the product:

- Supabase is the source of truth for shared, durable, cross-device workflow data.
- IndexedDB is the local execution layer: it may temporarily own in-progress capture queues, unsynced edits, cached records, local photo blobs, sync cursors, and offline retry state.
- React state is transient UI state only.

Practical rule:

- Before submit or flush, local queue or local edit state can be authoritative for that device.
- After submit or flush, Supabase is the canonical shared state for any record that another device needs to trust.
- Local copies may remain as cache, retry state, or retained working copies, but they are not the cross-device source of truth.

## 1. Sync Model

The system should use layered sync, not per-item timer polling.

### Tier 0: Session / connectivity
- Confirms the user is signed in and the client can reach Supabase.
- Triggered on app/site load, resume, foreground, and reconnect.
- No workspace data is mutated here.

### Tier 1: Workspace metadata
- Includes `stores` and remote `batches`.
- Handles create, rename, archive, status updates, and remote linking.
- Sync strategy: bulk poll or delta poll.
- Cadence: every `30-60s` while active, plus immediately after local edits.

### Tier 2: Active working set
- Includes items for the currently selected store and current remote working scope.
- Sync strategy: scoped refresh, not global refresh.
- Triggered when a store/batch view becomes active, when the user selects it, and on explicit refresh.

### Tier 3: Item detail
- Includes one item’s metadata, photo state, and edit state.
- Sync strategy: on-demand fetch or targeted refresh.
- Triggered when the user opens or edits an item.

### Tier 4: Media and upload operations
- Includes photo uploads, storage objects, verification, and cleanup.
- Sync strategy: push immediately on local action.
- Avoid repeating this on a timer unless a retry is required.

## 2. Platform Roles

This is the current proposed split.

### Mobile owns
- Capture context editing
- Camera capture
- Local capture workflow / queue
- Current item packet editing
- Photo upload initiation
- Capture-side metadata entry
- Immediate push of capture context changes to Supabase
- Local photo retention until upload safety conditions are met

### Desktop owns
- Listing queue and workbench
- Store/batch administration
- Item review and marking listed/hold/needs-retake
- Workspace bootstrap from Supabase
- Ongoing workspace poll and selected-scope refresh

### Shared ownership
- `stores`
- `batches`
- `items`
- `photos`
- upload state
- retention state

Shared ownership means both platforms may read and write, but each field still needs a clear winner when conflicts happen.

## 3. Data Ownership Rules

### Store-level data
- `name`: shared, but latest update wins.
- `short_code`: shared, but latest update wins.
- `remoteId`: shared linkage field, should never be lost once established.

### Batch-level data
- `name`: shared, latest update wins.
- `status`: shared, latest update wins.
- `remoteRetentionMode`: shared, latest update wins.
- `remoteId`: shared linkage field.

Note:
- Backend `batches` remain shared remote records.
- The exact mapping between a mobile local queue/workflow and backend batches is still deferred.

### Item-level data
- `sequence`: shared, but should be stable once created.
- `sku`, `notes`, `weight`, `dimensions`: shared metadata.
- `status` / listing state: desktop-led in the current workflow, but mobile may create the item record during upload.
- `storeId`: shared linkage field, but mobile capture may change this per item before submit.
- `remoteId`: shared linkage field.

### Photo-level data
- `capturedAt`: mobile-owned when the photo originates on the phone.
- `uploadStatus` and `remoteStatus`: shared.
- `localStatus`: local-side storage concern.
- `remoteId`: shared linkage field.

## 4. Conflict Strategy

The system should prefer deterministic resolution over silent duplication.

### Normal rule
- If the same record has a newer `updated_at`, that version wins.

### When fields differ
- Non-overlapping changes may be merged.
- Example: one side changes store name while the other side changes batch name.

### When the same field conflicts
- Prefer the latest timestamp.
- If timestamps are too close or unavailable, use a deterministic rule and log the conflict.

### Linkage rule
- If a local record already has a `remoteId`, update that remote row instead of creating a duplicate.
- If a remote row exists with the same unique natural key, link to it rather than duplicating.

## 5. Polling Strategy

### Recommended cadence
- Workspace metadata: `45-60s`
- Active scope: `15-30s` if the view is open and active
- Item detail: on-demand

### Backoff
- On any sync error, increase the interval temporarily.
- Stop aggressive polling when the app/site is backgrounded or unfocused.

### Push then poll
- Local edits should push immediately when possible.
- Polling is the safety net that catches edits made on the other platform.

## 6. Recommended Request Shape

### Workspace metadata poll
Fetch:
- all `stores`
- all `batches`

Use:
- `updated_at`
- `remoteId`
- natural keys like `short_code` and `(store_id, name)`

### Active scope poll
Fetch:
- items for the selected store and active batch
- associated photos only for those items

Do not fetch the entire workspace photo set on every interval.

### Item detail fetch
Fetch:
- one item
- that item’s photos
- that item’s upload/remote state

Only do this when the user is looking at or editing the item.

## 7. Current Product Interpretation

This is the practical division the code should move toward:

- `mobile` is the capture authority and local queue authority.
- `desktop` is the listing and workspace authority.
- Supabase is the shared source of truth for synced records.
- Each platform keeps local state for speed, but remote-linked rows win over anonymous local duplicates.

For the current iPhone direction:

- one mobile local queue may contain items from multiple stores
- `Next` defines the item boundary locally
- `Submit` is the deliberate handoff action for eligible unsubmitted items
- mobile should not silently auto-submit by default in MVP

That does not mean one platform is “master” for everything.
It means each platform should own the flow it is best at, while shared records stay reconciled through `remoteId` and `updated_at`.

## 8. What Not To Do

- Do not poll every item individually on a timer.
- Do not fetch all photos globally every minute.
- Do not treat workspace metadata and photo media with the same cadence.
- Do not create new duplicate stores/batches when a remote-linked record already exists.
- Do not use polling to compensate for missing local linkage fields.

## 9. Open Questions

- Should desktop or mobile be the default owner for `items.status` after an upload is listed?
- Should workspace metadata use a strict last-write-wins rule, or should some fields be platform-owned?
- Should active-scope polling be faster on the device that is currently in focus and slower everywhere else?
- Should we add explicit sync markers, or is `updated_at` plus `remoteId` enough for this product?

## 10. Next Discussion

The next thing to decide is the platform split:

- What the `mobile` app should own permanently
- What the `desktop` site should own permanently
- Which records are shared but platform-prioritized
- Which edits should push immediately versus wait for the next poll

That discussion should happen against this contract, not from scratch.
