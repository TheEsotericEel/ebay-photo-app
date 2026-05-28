# Capture Workflow Status

Date: 2026-05-28

This is a state-of-app recap for the current iOS capture workflow. It tracks what is implemented, what is stable enough to build on, and what still needs careful follow-up.

## Current implemented user flow

### Auth / Capture Home entry
- Clean normal launch on a fresh install still opens `AuthView`.
- `-open-capture-home` is the deterministic local/dev route into authenticated `Capture Home` without persisting fake auth.

### Open Camera
- `Capture Home -> Open Camera` opens the live `CameraSessionView`.
- Live camera controls keep real capture behavior intact.

### Capture photos
- `Capture` adds a real captured photo to the current draft.
- The current draft retains optional metadata fields in AppState:
  - SKU
  - weight
  - dimensions
  - notes

### Next / Done
- `Next` with draft photos opens `ItemDetailsScreen`.
- `Done` with draft photos also opens `ItemDetailsScreen`.
- `Next` with no draft photos shows a status message and does not advance.
- `Done` with no draft photos exits to `Capture Home`.

### ItemDetailsScreen
- The live item checkpoint edits the existing draft metadata:
  - SKU
  - weight
  - dimensions
  - notes
- `Cancel` returns to the same live draft.
- `Next Item` finalizes the current draft item and returns to the camera for the next item.
- `Submit` finalizes the current draft item and opens `Queue Review`.

### Queue Review
- Queue Review shows finalized queued item rows with item number, photo count, metadata, and submit state.
- Item rows still open the existing queue item editor.
- The queue item editor can edit queued metadata and remove a queued item with confirmation.
- Removing a queued item does not affect the current live draft.
- After removing the last queued item, Queue Review shows the empty state.

### Queue Review Submit
- `Submit` uses the existing shared `submitQueuedItems` helper and upload path.
- Submit is disabled when there are no eligible queued items.
- Submit shows explicit ready-count, in-progress, success, and failure messaging.
- Queue Review stays open after submit so the user can inspect submitted, failed, and retryable items.
- Submitted items retain their queue state until the user chooses the manual safe-local cleanup action.
- `Clear Safe Local Copies` is user-initiated only; it is eligible only for submitted items whose photo assets are already uploaded or otherwise verified safe to clear.
- Current draft photos, local queued items, failed queued items, and retryable items remain preserved.
- Mixed success/failure states remain visible in the queue using the existing item submit-state fields.

### Main Screen return
- `Main Screen` remains the deliberate exit from Queue Review back to `Capture Home`.

### Mock flow
- `Preview Intake Flow` still opens the mock prototype flow.
- The mock flow remains separate from the live camera path.

## Current debug/test entry points

- Clean normal launch without debug args
  - Expected on a fresh install: `AuthView`
- `-open-capture-home`
  - Expected: `Capture Home`
- `-open-live-camera-with-seeded-photo`
  - Expected: live camera with a seeded draft photo
- `-open-mock-intake-flow`
  - Expected: mock intake flow
- `-open-input-lab`
  - Expected: input lab
- `scripts/verify-debug-launch-routes.sh`
  - Auto-selects a booted simulator if available
  - Otherwise boots a suitable iPhone simulator, preferring `Smoke iPhone 17 Pro`
  - Saves screenshots under `tmp/debug-launch-routes/`

## What is now solid enough

- Live camera handoff flow through `ItemDetailsScreen`
- Queue-local metadata preservation for SKU, weight, dimensions, and notes
- Queue Review metadata display before submit
- Queue item removal safety without affecting the live draft
- Submit-result semantics:
  - ready count
  - in-progress state
  - success/failure status copy
  - visible submitted / failed mixed states
- DEBUG launch route verification harness
- `AppStateQueueTests` coverage for queue enqueue, metadata editing, and safe removal

## Remaining workflow risks

- Real remote upload confirmation remains the least proven part of the flow.
- Local photo cleanup policy after successful submit is intentionally conservative and user-initiated only.
- The seeded live-camera route can still show the first-run camera permission prompt on fresh simulator boots.
- There is still no dedicated UI test target; verification is script/manual plus unit tests.
- Some live flow interactions are still more code-backed than fully interactive verified.

## Recommended next 5 implementation slices

1. Tighten submit-result persistence semantics.
   - Keep Queue Review open after submit and make the final state clearer for mixed success/failure queues.
   - Keep the existing upload path and cleanup policy.

2. Add a minimal UI smoke test target if the project is ready for it.
   - Cover the debug routes and the live handoff checkpoints with accessibility identifiers.

3. Confirm the intended remote-submit handoff policy.
   - Decide when the queue should stay visible after submit versus dismiss to `Capture Home`.

4. Add a small retry-oriented failure review path.
   - Reuse existing item state fields for queue items that failed upload.

5. Revisit local photo cleanup after successful remote submit.
   - Only after the remote submit behavior is fully trustworthy and observable.

## Notes

- `Capture Home -> Upload Batch` still refuses to submit if the current draft has photos and shows: `Finish the current item before submitting.`
- `Clear Safe Local Copies` never touches current draft photos and only operates on submitted items that are already eligible for manual local cleanup.
- The mock flow is intentionally not used as a substitute for the live capture flow.
- The debug route harness is the preferred local verification entry point for deterministic launch-state checks.
- See [`REMOTE_SUBMIT_VERIFICATION.md`](/Users/joe/Projects/ebay-photo-app/docs/REMOTE_SUBMIT_VERIFICATION.md) for the manual remote-submit checklist and Supabase checks.

## Current cleanup audit

- `CameraMetadataTray` was removed from `RootView.swift` because it was no longer referenced after the live camera moved to `ItemDetailsScreen`.
- The remaining cleanup policy is consistent with current flow: submitted items may become manually eligible for safe local cleanup, while local, failed, retryable, and current-draft photos stay protected.
- No other clearly stale capture-flow code was found in the reviewed path that was safe to remove without a broader refactor.
