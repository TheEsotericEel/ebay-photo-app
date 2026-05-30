# Native iOS Capture Flow Contract

This document is the current authority for native iOS capture-flow button semantics and session boundaries.

## Scope

- Live camera capture flow only.
- Review and submit semantics for the native iOS app.
- Photo durability rules that affect when it is safe to advance or submit.

## Capture Home

- `Open Camera` enters the live camera.
- `Review Queue` opens Queue Review so the user can inspect queued items without uploading.
- `Upload Batch`, when present, is an upload shortcut and must use the same safety checks as Queue Review submit.

## Live Camera

- `Capture` adds a photo to the current item.
- `Next` finishes photographing the current item and opens the item details/checkpoint screen.
- `Done` finishes the capture session and moves toward review/home:
  - with current draft photos: open the item checkpoint
  - with no current draft photos but queued items: open Queue Review
  - with no current draft photos and an empty queue: return to Capture Home
- `Next` and `Done` must not upload.

## Item Details / Checkpoint

- This is the optional details-entry surface for the current item.
- The user may type details or skip immediately.
- `Save & Next` queues/saves the current item and returns to live camera for the next blank item.
- `Continue to Review` queues/saves the current item and opens Queue Review.
- Neither action uploads.

## Queue Review

- Queue Review is the session/batch review surface.
- `Submit` uploads, sends, or hands off queued work upstream.
- `Submit` must mean upload/handoff only.
- `Submit` must not be used for non-upload checkpoint actions.

## Photo Durability

- Listing/square image and thumbnail are required local assets.
- Deferred original/native JPEG generation may happen after capture.
- Submit must not race required pending local persistence.
- Local photos must not be considered safe to delete until upload/handoff safety rules allow it.

## Notes

- `Done` is a session-boundary action, not an upload action.
- `Next` is the checkpoint entry action, not the submit action.
- `Submit` is the upload/handoff action, not the checkpoint action.
