# Cursor Handoff: Native iOS Camera App

## Current Direction
- The web camera work has been superseded by a native iOS app.
- Work is happening in the `ios/` Xcode project on `main`.
- The app is a SwiftUI + AVFoundation camera client for fast eBay item photo capture.
- Rear camera only.
- Current visible lens modes are `.5` and `1x`.
- Debug auth bypass is intentionally enabled in native debug builds so the app launches into the camera flow during development.

## What Already Exists
- Xcode project and native app shell:
  - `ios/EbayPhotoApp.xcodeproj`
  - `ios/EbayPhotoApp/App/EbayPhotoAppApp.swift`
  - `ios/EbayPhotoApp/App/AppState.swift`
- Camera pipeline:
  - `ios/EbayPhotoApp/Services/CameraService.swift`
  - `ios/EbayPhotoApp/Views/CameraPreviewView.swift`
- Camera UI:
  - `ios/EbayPhotoApp/Views/RootView.swift`
- Photo model:
  - `ios/EbayPhotoApp/Models/CapturedPhoto.swift`
- Native Info.plist permissions:
  - `ios/EbayPhotoApp/Resources/Info.plist`

## What the Native App Does Now
- Rear camera discovery and lens switching.
- Two visible lens chips:
  - `.5`
  - `1x`
- Auto vs locked lens switching mode.
- Pinch-to-zoom and a compact zoom slider.
- Per-lens zoom persistence.
- Single tap focus/exposure.
- Double tap reset to continuous AF/AE.
- Capture cooldown / duplicate-shot protection.
- Recent capture thumbnail for the current item.
- Single-step undo for the current item.
- Grid / 1:1 / horizon guide toggles.
- Debug capability summary in the camera screen.

## Important Crash Fixes Already Made
- Deprecated photo-resolution APIs were removed.
- `AVCapturePhotoOutput.maxPhotoDimensions` is now used instead of:
  - `isHighResolutionPhotoEnabled`
  - `isHighResolutionCaptureEnabled`
- `maxPhotoDimensions` is only assigned after the photo output is connected to a video source.
- `maxPhotoDimensions` is derived from `device.activeFormat.supportedMaxPhotoDimensions`.
- The zoom slider crash was fixed by not rendering the slider until there is a real zoom range.

## Current Known Native Rules
- Do not hard-code photo dimensions.
- Do not set `maxPhotoDimensions` before the photo output has a video connection.
- Recompute photo dimensions when the lens/device changes.
- Keep the camera UI minimal and camera-first.

## Good Starting Files
- `ios/EbayPhotoApp/Services/CameraService.swift`
- `ios/EbayPhotoApp/Views/RootView.swift`
- `ios/EbayPhotoApp/App/AppState.swift`
- `ios/EbayPhotoApp/Models/CapturedPhoto.swift`

## Recent Validation
- `xcodebuild -project ios/EbayPhotoApp.xcodeproj -scheme EbayPhotoApp -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build` succeeds.

## Suggested Next Work
- Add or refine camera behavior only when it has a clear product reason.
- Keep `auto` vs `locked` lens semantics explicit.
- Keep focus/exposure gestures unambiguous:
  - single tap = set focus + exposure point
  - double tap = reset to continuous AF/AE
- Keep undo current-item only.

## What Not To Do Yet
- Telephoto
- RAW / ProRAW
- Manual ISO / shutter / white balance
- Full undo/redo stack
- Animated Apple Camera zoom wheel
- Advanced settings page
- Generic camera picker

