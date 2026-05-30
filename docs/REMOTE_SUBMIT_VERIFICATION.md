# Remote Submit Verification

Date: 2026-05-28

This guide documents how to verify the final Queue Review submit handoff against a real Supabase backend when the required credentials and auth session are available.

## Scope

- Uses the existing live capture flow.
- Uses the existing `submitQueuedItems` helper.
- Uses the existing Supabase upload path.
- Does not change local photo cleanup behavior.
- Does not seed remote data automatically.

## Launch routes to start from

Recommended debug routes:

- `-open-capture-home`
  - deterministic local/dev entry into authenticated `Capture Home`
- `-open-live-camera-with-seeded-photo`
  - opens the live camera with a seeded draft photo for route verification
- `-open-mock-intake-flow`
  - mock flow only; not used for remote submit verification

For route validation and screenshots:

```bash
./scripts/verify-debug-launch-routes.sh
```

## Suggested manual remote-submit flow

1. Launch with `-open-capture-home`.
2. Open Camera.
3. Capture at least one real item photo.
4. Tap `Next` to open `ItemDetailsScreen`.
5. Enter metadata if needed:
   - SKU
   - weight
   - dimensions
   - notes
6. Tap `Continue to Review` to save the item and open Queue Review.
7. Confirm the queue rows show the finalized item metadata and submit state.
8. Tap `Submit` on Queue Review.

## Expected app behavior

### Before submit
- Queue Review stays open.
- Submit is disabled when there are no eligible queued items.
- The screen shows how many finalized queued items are ready to submit.

### While submitting
- Submit stays disabled.
- Progress remains visible.
- The current item progress message should include queue position and photo count, for example:
  - `Submitting item 1 of 3 (2 photos)`

### On full success
- Queue Review stays open.
- The app should show a success message similar to:
  - `Submission complete. Queue Review stays open.`
  - `Submitted 1 finalized item(s). Queue Review remains open.`
- Submitted queue rows should visibly show `Submitted`.
- Local photo assets should not be auto-deleted in this slice.
- After a successful remote submit has been confirmed, the user may use `Clear Safe Local Copies` from Capture Home to remove only submitted items' safe local duplicates; it remains manual and never targets current draft photos.

### On partial success / mixed result
- Queue Review stays open.
- Submitted rows stay visible as `Submitted`.
- Failed rows remain retryable and show their error text if available.
- The app should show mixed-result copy similar to:
  - `Submission completed with failures. Queue Review stays open.`
  - `Submitted 1 finalized item(s); 1 failed and remain in queue.`

### On total failure
- Queue Review stays open.
- All queued items remain for retry.
- Failed rows should remain in the queue with their error state.

### On empty or ineligible queue
- Submit stays disabled.
- The app should show a message similar to:
  - `No queued items are ready to submit. Queue Review stays open.`

## What to check remotely in Supabase

If dashboard or SQL access is available, confirm:

- `batches`
  - upload status updates to the submitted state for the batch
- `items`
  - rows exist for the queued items
  - `sku`, `notes`, `weight`, and `dimensions` match the values entered in `ItemDetailsScreen`
  - `status` reflects the upload state used by the backend
- `photos`
  - rows exist for the item photos
  - `upload_status` and `remote_status` transition from `uploading/not_uploaded` to `uploaded`
  - `last_upload_error` is empty on success or populated on failure
- `photo_variants`
  - listing and thumbnail variants exist for uploaded photos

## Known local/dev limitations

- A real remote submit cannot be confirmed without valid Supabase credentials and an authenticated session.
- A clean normal launch still opens `AuthView` unless a persisted session or `-open-capture-home` is used.
- `-open-live-camera-with-seeded-photo` may show the first-run camera permission prompt on a fresh simulator boot.
- The harness verifies route structure, not a real remote upload.
- If `DEVELOPMENT_AUTH_BYPASS` is `NO`, a simulator build will still need a real authenticated session before upload can succeed.

## Helpful logs

- Use `scripts/ios-tail-sim-logs.sh com.joesprojects.ebayphotoapp` while attempting a remote submit.
- The most useful app-side status fields are:
  - `statusMessage`
  - `uploadMessage`
  - `queueSubmitProgress.message`

## Exit path

- `Main Screen` remains user-controlled and returns Queue Review to `Capture Home` after submit when chosen.
