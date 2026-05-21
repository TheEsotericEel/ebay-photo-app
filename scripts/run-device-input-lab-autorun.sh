#!/usr/bin/env bash
# Capture [INPUT-LAB] autorun timings on a connected physical iPhone (DEBUG only).
# Requires: device awake and passcode-unlocked (home screen visible), trusted, developer mode on.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE_NAME="${DEVICE_NAME:-third nipple}"
BUNDLE_ID="com.joesprojects.ebayphotoapp"
DERIVED="${DERIVED:-/tmp/ebay-photo-dd-device}"
APP="${DERIVED}/Build/Products/Debug-iphoneos/EbayPhotoApp.app"
LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/device-input-lab-autorun.log"
WAIT_SECONDS="${WAIT_SECONDS:-120}"

mkdir -p "${LOG_DIR}"
: > "${LOG_FILE}"

wait_for_launchable() {
  local elapsed=0
  while (( elapsed < WAIT_SECONDS )); do
    if xcrun devicectl device process launch \
      -d "${DEVICE_NAME}" \
      --terminate-existing \
      "${BUNDLE_ID}" 2>/dev/null; then
      xcrun devicectl device process terminate -d "${DEVICE_NAME}" "${BUNDLE_ID}" 2>/dev/null || true
      return 0
    fi
    xcrun devicectl device info lockState -d "${DEVICE_NAME}" 2>/dev/null | rg 'lock state|passcode|unlocked' || true
    echo "Waiting for iPhone to be awake and unlocked (tap screen, enter passcode)… ${elapsed}s"
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "ERROR: Device still not launchable after ${WAIT_SECONDS}s."
  echo "Wake the phone, unlock to the home screen, keep the display on, then rerun."
  exit 1
}

echo "Building Debug for device..."
xcodebuild -project "${ROOT}/ios/EbayPhotoApp.xcodeproj" \
  -scheme EbayPhotoApp \
  -configuration Debug \
  -destination "platform=iOS,name=${DEVICE_NAME}" \
  -derivedDataPath "${DERIVED}" \
  build -quiet

echo "Installing ${APP}..."
xcrun devicectl device install app -d "${DEVICE_NAME}" "${APP}"

echo "Checking device can launch apps (home screen must be visible)..."
wait_for_launchable

echo "Launching with -open-input-lab -input-lab-autorun (non-blocking)..."
echo "Note: [INPUT-LAB] uses os.Logger — view in Xcode Console while debugging, not this script log."
# Use -- so launch args are not parsed as devicectl flags. Avoid --console (waits until app exits).
xcrun devicectl device process launch \
  -d "${DEVICE_NAME}" \
  --terminate-existing \
  "${BUNDLE_ID}" \
  -- -open-input-lab -input-lab-autorun \
  2>&1 | tee "${LOG_FILE}"

echo ""
echo "Launched. Autorun finishes in ~5s on device; then manually test Cases 1–4 (especially Case 1 vs 4)."
