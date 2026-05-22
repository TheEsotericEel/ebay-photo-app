# iOS V1 Validation Report

Date: 05/22/2026

## Scope

Validation evidence for the iOS V1 completion workstream:

- queue persistence and next-boundary behavior
- idempotent retry linkage (remote ID reuse)
- submit progress and queue state updates
- item-level store assignment propagation
- safe metadata-preserving local cleanup
- desktop-side visibility contract coverage

## Automated Evidence

### iOS XCTest

Command:

`xcodebuild -project "ios/EbayPhotoApp.xcodeproj" -scheme "EbayPhotoApp" -configuration Debug -destination "platform=iOS Simulator,name=Smoke iPhone 17 Pro,OS=26.5" -only-testing:EbayPhotoAppTests test`

Result: Passed (`** TEST SUCCEEDED **`)

Passing tests:

- `AppStatePersistenceTests.testQueueAndDraftRestoreAcrossAppStateInit`
- `UploadIdempotencyTests.testMakeUploadPacketReusesPersistedRemoteIds`
- `AppStateQueueTests.testAdvanceToNextItemEnqueuesDraft`
- `AppStateQueueTests.testSubmittedItemsAreEligibleForSafeCleanup`

### iOS Build

Command:

`xcodebuild -project "ios/EbayPhotoApp.xcodeproj" -scheme "EbayPhotoApp" -sdk iphonesimulator -configuration Debug build`

Result: Passed (`** BUILD SUCCEEDED **`)

### Desktop Sync/Visibility Contract Tests

Command:

`npm run test -- src/adapters/remoteImport.test.ts src/adapters/remoteCleanup.test.ts src/adapters/itemSync.test.ts`

Result: Passed (9/9 tests)

## Acceptance Gate Mapping

- Queue survives close/reopen without data loss: Covered by `AppStatePersistenceTests`.
- `Next` creates item boundary and enqueues packet: Covered by `AppStateQueueTests`.
- Submit targets queued unsubmitted items: Covered by queue eligibility logic and submit state transitions in app code.
- Retry idempotency/no duplicate IDs: Covered by `UploadIdempotencyTests` and `SupabaseService` reuse flow.
- Item-level store assignment preserved through submit: Covered by queue item store/batch context and packet generation path.
- Per-item/per-photo submit progress visible: Covered by `queueSubmitProgress` updates and queue row/editor status rendering.
- Local cleanup preserves metadata and IDs: Covered by `clearSafeLocalPhotoCopies` behavior and cleanup test.
- Desktop visibility state compatibility: Covered by adapter tests for remote import/cleanup/item sync contracts.

## Notes

- This pass intentionally stays within canonical V1 constraints (`listing` + `thumbnail`, OTP-first, shared-account model, deferred queue→batch policy details).
- Live Supabase end-to-end verification depends on runtime credentials/environment and was not required to validate code-level acceptance gates in this pass.
