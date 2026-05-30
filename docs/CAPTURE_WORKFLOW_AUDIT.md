# Capture Workflow Audit

Date: 2026-05-27

## Current implemented workflow

Fresh app launch:
- If `DEVELOPMENT_AUTH_BYPASS` is disabled and there is no persisted Supabase session, the app opens `AuthView`.
- If the user is authenticated, the app opens `Capture Home`.

Live capture flow:
- `Capture Home -> Open Camera` opens `CameraSessionView`.
- `Next` with at least one draft photo opens `ItemDetailsScreen`.
- `Next` with no draft photos does not advance and sets `Capture at least one photo before continuing.`
- `Done` remains pending final product decision; current code opens `ItemDetailsScreen` when at least one draft photo exists.
- `Done` with no draft photos exits the camera back to `Capture Home`.

Item details checkpoint:
- `Cancel` dismisses `ItemDetailsScreen` and returns to the same live draft.
- `Save & Next` calls `appState.advanceToNextItem()`, which queues the current draft if it has photos, increments the item number, and clears the draft.
- `Submit` also calls `appState.advanceToNextItem()`, then opens `Queue Review`.

Queue review and submit handoff:
- `Queue Review -> Submit` calls the shared `submitQueuedItems(advanceCurrentDraftIfNeeded: false)` helper.
- `Capture Home -> Upload Batch` also uses that helper, but now refuses to run if the current draft still has photos.
- `Queue Review -> Main Screen` dismisses queue review back to `Capture Home`.

Mock flow:
- `Preview Intake Flow` is isolated behind `-open-mock-intake-flow` or the home-screen button.
- Mock camera -> item details -> queue review remains separate from the live flow.

## Verified paths and results

Runtime verified:
- `xcodebuild` for the iOS app succeeded.
- Fresh normal launch on a clean simulator install opened `AuthView`, not `Capture Home`.
- `-open-capture-home` opens `Capture Home` without seeding photos or fake persistence.
- `-open-live-camera-with-seeded-photo` opened the live camera with a seeded draft photo.
- The seeded live camera shows `Done` in the top bar and `Next` in the bottom action area.
- `-open-mock-intake-flow` opened the mock prototype flow.
- `xcodebuild test -only-testing:EbayPhotoAppTests/AppStateQueueTests` succeeded.

Code-backed:
- `Open Camera -> no photos -> Done` exits back to `Capture Home` via the `onDone()` closure in `CameraSessionView`.
- `Open Camera -> no photos -> Next` is a no-op with status text `Capture at least one photo before continuing.`
- Seeded live camera `Next -> ItemDetailsScreen -> Cancel` preserves the same draft because `onCancel` only dismisses the sheet.
- Seeded live camera `Save & Next` finalizes the current item and returns to the camera because `onNextItem` calls `appState.advanceToNextItem()` and clears `showingDetails`.
- Seeded live camera `Done -> ItemDetailsScreen -> Submit -> Queue Review -> Main Screen` is wired end to end in `RootView`.
- Multi-item sessions should accumulate finalized items in `queuedItemPackets` because each `advanceToNextItem()` call first invokes `enqueueCurrentItemIfNeeded()`.
- `Capture Home -> Upload Batch` refuses to submit while `capturedPhotos` is non-empty and sets `Finish the current item before submitting.`
- `Queue Review -> Submit` uses the same helper as `Capture Home -> Upload Batch`.

Test-backed:
- `AppStateQueueTests.testAdvanceToNextItemEnqueuesDraft()` confirms `advanceToNextItem()` queues the current draft, increments the item number, and clears the draft.
- `AppStateQueueTests.testSubmittedItemsAreEligibleForSafeCleanup()` confirms submitted queue items transition into the cleanup-eligible state as expected.

## Confusing or broken paths

1. Fresh launch does not currently satisfy `Normal launch -> Capture Home`.
The current implementation requires either a persisted Supabase session, `DEVELOPMENT_AUTH_BYPASS`, or a DEBUG launch route. On a clean simulator install, the user lands on `AuthView`.

2. The live workflow is only partially runtime-verifiable right now.
The simulator accessibility surface was unstable during this audit, so several live interactions had to be confirmed from code rather than a full click-through.

3. The seeded live-camera route authenticates only in memory.
It opens the live camera for verification, but a later plain relaunch still returns to `AuthView` on a clean install.

4. Queue-review submit outcome in local/dev remains under-verified in this audit.
The helper path is shared and correctly wired, but this audit did not complete a fresh end-to-end remote upload confirmation from queue review.

## Recommended next 3 implementation slices

1. Add a deterministic debug verification route for the live capture workflow.
Include optional launch actions such as `open item details`, `submit current draft`, and `return to capture home` so audits do not depend on flaky simulator accessibility.

2. Decide the intended development launch behavior.
If the expected daily workflow is `Capture Home` first, either enable a reliable development auth bypass for local runs or document that auth is now part of the normal iOS flow.

3. Add a minimal UI smoke test target for the live camera bridge.
Cover `Open Camera`, `Done/Next`, `ItemDetailsScreen`, `Queue Review`, and the Upload Batch draft guard.

## Risks before broader features

- The live workflow is now cleaner, but it is still under-instrumented for repeatable end-to-end verification.
- The auth gate and the capture workflow are currently entangled in local testing, which makes regressions harder to spot quickly.
- Broader features such as richer item metadata or queue management will be riskier until the session handoff and submit path have stable automated coverage.
