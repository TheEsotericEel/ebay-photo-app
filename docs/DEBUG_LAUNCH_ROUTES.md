# Debug Launch Routes

This repo does not have an iOS UI test target. Use the small simulator harness below to verify the debug launch routes that support local workflow development.

Bundle ID:

- `com.joesprojects.ebayphotoapp`

## Script

From the repo root:

```bash
./scripts/verify-debug-launch-routes.sh
```

What it does:

- builds the Debug app
- uses the currently booted simulator if one exists
- otherwise boots a suitable iPhone simulator, preferring `Smoke iPhone 17 Pro` when available
- waits for the simulator to finish booting before install/launch
- clears the app from the simulator before the run
- launches each debug route one at a time
- writes screenshots to `tmp/debug-launch-routes/`

## Routes

1. Clean normal launch without debug args
   - Expected: `AuthView` on a clean install

2. `-open-capture-home`
   - Expected: `Capture Home`

3. `-open-live-camera-with-seeded-photo`
   - Expected: live camera with a seeded draft photo

4. `-open-mock-intake-flow`
   - Expected: mock intake flow

5. `-open-input-lab`
   - Expected: input lab

## Notes

- The debug launch arguments are mutually exclusive. Do not combine them.
- `-open-capture-home` is DEBUG-only and only marks the current process as authenticated in memory.
- The seeded live camera route does not upload the fake photo.
- If the seeded live camera shows a first-run camera permission prompt, grant access once and rerun the route.
- If no simulator is booted, the harness will boot one automatically.
