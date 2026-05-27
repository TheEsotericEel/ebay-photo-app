# Live Camera Bridge Verification

This repo does not currently have a UI test target, so the bridge is verified with a DEBUG-only launch route and the existing simulator.

## Debug launch argument

`-open-live-camera-with-seeded-photo`

## Manual verification steps

1. Run the iOS app in DEBUG on the simulator with the launch argument above.
2. Confirm the app opens directly into the live camera screen.
3. Confirm `Next` opens `Item Details`.
4. Confirm `Next Item` returns to the live camera with the next item number and a cleared draft.
5. Confirm `Submit` reaches the existing queue review path without touching DB submit.
6. Relaunch without the launch argument and confirm normal `Open Camera` and `Preview Intake Flow` behavior still work.

## Notes

- The seeded draft photo is local-only and is not uploaded.
- This route exists only for verification and does not change normal production launch behavior.
