> [!WARNING]
> Historical browser-camera diagnostic reference.
>
> This file may still be useful for browser or PWA camera testing, but it is not current product architecture. Native iOS is the primary capture path.

# Phase 0 — iPhone Camera Testing Guide

## Why plain `http://LAN-IP` does not work

Browser camera APIs (`getUserMedia`, `MediaDevices`) require a **secure context**.

A secure context is one of:
- `https://` with a trusted certificate
- `http://localhost` (localhost is always treated as secure)

Plain `http://192.168.x.x` is **not** a secure context.  
On iPhone Safari, `navigator.mediaDevices` will be `undefined` on insecure origins.  
The app detects this and shows a clear error in the Diagnostics panel instead of a cryptic crash.

---

## Option 1 — Vercel deployment (recommended)

Deploy the built app to Vercel. Vercel provides a stable `https://*.vercel.app` URL that iPhone Safari trusts automatically. No tunnel, no LAN configuration, no certificate warnings.

### Build command and output directory

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Framework | Vite (auto-detected) |

### Deploy via Vercel CLI (one-time setup)

```
npm install -g vercel
vercel login
vercel --prod
```

On first run Vercel asks a few questions:
- **Set up and deploy?** → Yes
- **Which scope?** → your personal account
- **Link to existing project?** → No (creates a new project)
- **Project name?** → accept default or type `ebay-photo-spike`
- **In which directory is your code?** → `.` (current directory)
- **Want to modify settings?** → No (Vercel auto-detects Vite correctly)

Vercel will print a production URL like:
```
https://ebay-photo-spike-xxxx.vercel.app
```

Open that URL on iPhone Safari. Camera permissions will work.

### Re-deploy after code changes

```
vercel --prod
```

### Deploy via Vercel Git integration

1. Push the repo to GitHub/GitLab/Bitbucket.
2. Go to https://vercel.com/new and import the repository.
3. Vercel auto-detects Vite. Accept the defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Click **Deploy**.
5. Every `git push` to `main` redeploys automatically.

> Git integration is the recommended long-term path.  
> CLI is faster for a one-off spike test with no Git repo yet.

---

## Option 2 — Cloudflare Tunnel (local dev fallback)

Use this if you want to test a local dev build without deploying to Vercel.

Vite blocks requests from unknown hostnames by default, so you must pass the tunnel hostname via an env var — **do not use `server.allowedHosts: true`**.

1. In terminal 1 — start the tunnel:
   ```
   cloudflared tunnel --url http://localhost:5173
   ```
   Cloudflare prints a URL. Copy the hostname only (no `https://` prefix, no trailing `/`).  
   Example: `some-random-words.trycloudflare.com`

2. In terminal 2 — start Vite with that hostname allowed:
   ```
   __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=some-random-words.trycloudflare.com npm run dev
   ```

3. Open the `https://some-random-words.trycloudflare.com` URL on iPhone Safari.

> The tunnel URL changes every run. For repeatable testing, use Vercel (Option 1).

---

## Option 3 — ngrok (free tier, requires account)

```
ngrok http 5173
```
Open the `https://` URL ngrok prints. On the free tier a browser interstitial appears — tap **Visit Site** once to dismiss it.

---

## Option 4 — Vite HTTPS with `@vitejs/plugin-basic-ssl` (LAN, certificate warning)

```
npm install -D @vitejs/plugin-basic-ssl
```
Add `basicSsl()` to the `plugins` array in `vite.config.ts`, then `npm run dev`.  
Vite prints an `https://LAN-IP:5173` URL. Safari will warn about the certificate — tap **Show Details → visit this website** and then trust it in **Settings → General → About → Certificate Trust Settings**.

> Most friction option. Use only if internet access is unavailable.

---

## Preview behaviour

The live preview defaults to **Full frame** mode:
- The video is shown at its natural aspect ratio (typically 16:9 or 4:3). No CSS cropping.
- The square composition guide brackets indicate the region that will be saved as the listing image.
- Shaded bands appear on the left/right sides of the guide to show what will be cropped out.
- The **Fill guide** toggle crops and zooms the preview so the guide fills the screen — useful for composing tightly, but reduces visible context.

Square cropping happens **only at capture time** on the actual camera frame — the preview mode has no effect on the saved image dimensions or quality.

---

## What to check in the Diagnostics panel on iPhone

When the app loads on iPhone Safari via HTTPS, scroll to the **Diagnostics** section and confirm:

| Field | Expected value |
|---|---|
| `isSecureContext` | `yes` |
| `protocol` | `https:` |
| `mediaDevices` | `yes` |
| `getUserMedia` | `yes` |
| Camera `state` | `active` (after permission granted) |

If `isSecureContext` shows `no`, you are still on an insecure origin.  
Double-check the URL in Safari starts with `https://`.

---

## Raw Camera Lab — iPhone 15 Pro Capability Diagnostic

The app includes a dedicated **Raw Camera Lab** mode for comprehensive capability testing on the target device. This lab automatically probes Safari/PWA JavaScript camera APIs and produces a copyable diagnostics JSON report.

### Purpose

Before building final production camera behavior, use the lab to discover what the iPhone 15 Pro actually exposes through Safari's media device APIs. The lab tests:

- Context diagnostics (userAgent, platform, secure context, API availability)
- Device enumeration (all video input devices with raw labels)
- Stream preset sweep (various resolution and aspect ratio constraints)
- DeviceId sweep (test each enumerated camera separately)
- Raw capture methods (ImageCapture.takePhoto, grabFrame, canvas, createImageBitmap)
- Aspect ratio/crop capability (native square, 4:3, 16:9 support with orientation awareness)
- High-resolution device tests (1920x1440, 1920x1080, 3024x4032 per rear device)
- Zoom capability (API exposure, min/max/step, applyConstraints per device)
- Focus capability (focusMode, focusDistance, pointsOfInterest with corrected conclusions)
- Torch/exposure/white balance capability (with apply tests)
- File input fallback diagnostic

### First lab run results (iPhone 15 Pro Safari/PWA)

The initial lab run revealed:
- Secure context works
- getUserMedia works
- enumerateDevices works
- 7 video inputs are exposed
- Rear devices include raw labels: Back Triple Camera, Back Dual Wide Camera, Back Ultra Wide Camera, Back Dual Camera, Back Camera, Back Telephoto Camera
- ImageCapture.takePhoto, grabFrame, canvas capture, and createImageBitmap all succeeded
- Zoom API is exposed on Back Triple Camera with min 0.5 and max 10, and applyConstraints min/mid/max succeeded
- Torch API is exposed and toggle succeeded
- focusMode is not exposed
- pointsOfInterest is not exposed
- focusDistance is reported, but only min is shown; no max/step and no successful focus-distance apply tests were reported
- Most deviceId and capture-method samples were only 480x640, which is too low to judge production viability
- The aspect ratio summary was confusing because portrait dimensions invert ratios, e.g. 1920x1080 request may return 1080x1920

### Refinements added

Based on the first run, the lab was refined to:
- **Fix focus conclusions**: Do not report manualFocusUsable as true merely because focusDistance exists. Report focusDistanceReported, focusDistanceControllable, and manualFocusUsable separately. If focusDistance lacks max/step and no apply test succeeds, mark manualFocusUsable as unknown or false.
- **Improve aspect-ratio reporting**: Account for portrait orientation. Report both raw aspect ratio and normalized aspect ratio. For example, 480x640 is treated as 3:4 portrait / 4:3 normalized. 360x640 is treated as 9:16 portrait / 16:9 normalized.
- **Add high-resolution device tests**: For each rear videoinput device, test 1920x1440, 1920x1080, and 3024x4032 constraints with takePhoto, grabFrame, and canvas capture. Record actual videoWidth/videoHeight, naturalWidth/naturalHeight, MIME type, byte size, and source settings.
- **Add per-device zoom tests**: For each rear device where capabilities.zoom exists, record min/max/step/current, apply min/1x/mid/max, and record updated getSettings() after each apply.
- **Add white-balance verification**: whiteBalanceMode reports manual/continuous. Try applying continuous and record success/failure.
- **Add capability matrix**: Concise summary table with multipleRearDevicesExposed, ultraWideDeviceLabelExposed, telephotoDeviceLabelExposed, highResVideoStreamWorks, highestObservedVideoDimensions, highestObservedTakePhotoDimensions, highestObservedCanvasDimensions, squareNativeStreamWorks, squareNativeHighestObservedDimensions, zoomCapabilityReported, zoomApplyWorks, torchReported, torchApplyWorks, focusDistanceReported, focusDistanceApplyWorks, tapToFocusExposed, manualFocusUsable, fileInputFallbackTested, fileInputObservedDimensions.

### How to use

1. **Deploy to Vercel** (see Option 1 above)
2. **Open on iPhone 15 Pro Safari** via the Vercel HTTPS URL
3. **Tap "Raw Camera Lab"** tab in the navigation header
4. **Tap "Run Full Capability Sweep"**
5. **Grant camera permission** when prompted
6. **Wait for the sweep to complete** — watch the log for progress (may take 1-2 minutes with new high-res tests)
7. **Review the Summary table** for quick capability overview
8. **Review the Capability Matrix** for concise production readiness indicators
9. **Optionally test file input fallback** — tap the file input to capture a photo
10. **Copy Diagnostics JSON** or **Download Diagnostics JSON**
11. **Paste results back** for review and decision-making

### What the lab does NOT do

- Does NOT implement production camera UX
- Does NOT force square capture as main behavior
- Does NOT force crop/post-processing except when testing aspect ratio constraints
- Does NOT assume macro, ultra-wide, telephoto, zoom, or tap-to-focus support
- Does NOT hard-code iPhone lens labels (shows raw device labels only)
- Does NOT use localStorage for photo blobs (uses IndexedDB for lab samples)
- Does NOT add Supabase, auth, upload, desktop queue, eBay features, AI features, billing, or team/account roles
- Does NOT claim optical zoom (tests zoom API behavior only)
- Does NOT claim manual focus unless applyConstraints succeeds with meaningful values

### Interpreting results

The lab produces a JSON report with:

- **Context diagnostics**: Browser/device info, secure context status, API availability
- **Devices**: All enumerated video input devices with raw labels and IDs
- **Stream tests**: Results for each constraint preset (dimensions, settings, capabilities)
- **DeviceId tests**: Results for testing each camera device separately
- **Capture method tests**: Success/failure for each capture path (takePhoto, grabFrame, canvas, createImageBitmap)
- **Aspect ratio tests**: Requested vs actual dimensions with normalized aspect ratio and orientation (landscape/portrait/square)
- **High-res device tests**: Per-device high-resolution capture results with takePhoto, grabFrame, canvas dimensions and byte sizes
- **Per-device zoom tests**: Zoom capability and applyConstraints results for each rear device
- **Zoom test**: API exposure, min/max/step, applyConstraints success
- **Focus test**: API exposure for focusMode, focusDistance, pointsOfInterest with corrected conclusions (focusDistanceReported, focusDistanceControllable, manualFocusUsable)
- **Torch test**: API exposure for torch, exposure, white balance with apply tests
- **White balance test**: API exposure and apply success for whiteBalanceMode
- **Summary**: Quick boolean table of what APIs are exposed
- **Capability Matrix**: Concise production readiness indicators

### Decision points after reviewing results

Only after reviewing the diagnostics JSON should you decide:

- Whether PWA camera capture is acceptable for production use
- Which capture method to use (ImageCapture vs canvas fallback)
- Whether native square aspect ratio is supported or client-side cropping is required
- Whether zoom/focus/torch controls can be built or should be deferred
- Whether multiple rear cameras are exposed for lens switching
- Whether high-resolution video streams are available for quality capture
- Whether to proceed with Phase 1 or move to Capacitor/native camera

### Clearing lab samples

The lab stores small thumbnail samples in IndexedDB. Tap **"Clear Lab Samples"** to remove them. This does not affect the Phase 0 camera test photos stored in a separate IndexedDB store.

---

## Manual test checklist (Phase 0 Camera)

- [ ] Open app on iPhone Safari via HTTPS URL
- [ ] Diagnostics panel shows `isSecureContext: yes`
- [ ] Camera permission prompt appears
- [ ] Rear camera preview starts (not front camera)
- [ ] Square overlay appears centered on the preview
- [ ] Capture 20–50 photos in rapid succession
- [ ] Capture feels fast — no visible stall between taps
- [ ] No major freezes or crashes
- [ ] Thumbnail grid updates after each capture
- [ ] Photo count increments correctly
- [ ] Refresh the page — pending count and thumbnails reload from IndexedDB
- [ ] Tap "Clear local test images" — count goes to zero
- [ ] Open iOS Photos app — confirm no new photos appeared there
- [ ] Capture close-up of small text — check readability of the saved square JPEG
- [ ] Check Diagnostics panel `zoom`, `focusModes`, `facingModes` values
- [ ] Expand "raw capabilities JSON" and note the full capabilities object

---

## Raw Camera Lab checklist (iPhone 15 Pro specific)

- [ ] Deploy to Vercel and open on iPhone 15 Pro Safari
- [ ] Tap "Raw Camera Lab" tab
- [ ] Tap "Run Full Capability Sweep"
- [ ] Grant camera permission
- [ ] Wait for sweep completion (may take 30-60 seconds)
- [ ] Review Summary table for quick capability overview
- [ ] Check if multiple rear devices are exposed
- [ ] Check if native square aspect ratio is supported
- [ ] Check if zoom API is exposed
- [ ] Check if focusMode/focusDistance/pointsOfInterest APIs are exposed
- [ ] Check if torch API is exposed
- [ ] Copy Diagnostics JSON and save for review
- [ ] Optionally test file input fallback
- [ ] Clear lab samples after testing
