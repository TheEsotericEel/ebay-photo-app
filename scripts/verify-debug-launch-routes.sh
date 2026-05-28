#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${ROOT}/ios/EbayPhotoApp.xcodeproj"
SCHEME="EbayPhotoApp"
DESTINATION="${DESTINATION:-platform=iOS Simulator,name=Smoke iPhone 17 Pro}"
DERIVED_DATA="${DERIVED_DATA:-${ROOT}/tmp/DerivedData-debug-routes}"
PREFERRED_DEVICE_NAME="${PREFERRED_DEVICE_NAME:-Smoke iPhone 17 Pro}"
BUNDLE_ID="com.joesprojects.ebayphotoapp"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT}/tmp/debug-launch-routes}"
APP="${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/EbayPhotoApp.app"

mkdir -p "${OUTPUT_DIR}"

resolve_device() {
  local booted_line
  booted_line="$(xcrun simctl list devices booted | grep ' (Booted)' | head -n 1 || true)"
  if [[ -n "${booted_line}" ]]; then
    echo "${booted_line}" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
    return 0
  fi

  local preferred_line
  preferred_line="$(xcrun simctl list devices available | grep -F "${PREFERRED_DEVICE_NAME}" | head -n 1 || true)"
  if [[ -n "${preferred_line}" ]]; then
    echo "${preferred_line}" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
    return 0
  fi

  local fallback_line
  fallback_line="$(xcrun simctl list devices available | grep ' (Shutdown)' | grep 'iPhone' | head -n 1 || true)"
  if [[ -n "${fallback_line}" ]]; then
    echo "${fallback_line}" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
    return 0
  fi

  return 1
}

DEVICE="$(resolve_device || true)"
if [[ -z "${DEVICE}" ]]; then
  echo "No suitable iPhone simulator is available."
  echo "Create or boot an iPhone simulator such as '${PREFERRED_DEVICE_NAME}' and rerun."
  exit 1
fi

echo "Building Debug app..."
xcodebuild \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration Debug \
  -destination "${DESTINATION}" \
  ARCHS=arm64 \
  -derivedDataPath "${DERIVED_DATA}" \
  build -quiet

if ! xcrun simctl list devices booted | grep -q "${DEVICE}"; then
  echo "Booting simulator ${DEVICE}..."
  xcrun simctl boot "${DEVICE}" >/dev/null 2>&1 || true
fi

echo "Waiting for simulator ${DEVICE} to be ready..."
xcrun simctl bootstatus "${DEVICE}" -b >/dev/null

echo "Installing app on ${DEVICE}..."
xcrun simctl uninstall "${DEVICE}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl install "${DEVICE}" "${APP}"

grant_camera_permission() {
  xcrun simctl privacy "${DEVICE}" grant camera "${BUNDLE_ID}" >/dev/null 2>&1 || true
}

capture_route() {
  local name="$1"
  shift
  local screenshot="${OUTPUT_DIR}/${name}.png"

  xcrun simctl terminate "${DEVICE}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 1
  grant_camera_permission
  xcrun simctl launch "${DEVICE}" "${BUNDLE_ID}" "$@" >/dev/null
  sleep 4
  xcrun simctl io "${DEVICE}" screenshot "${screenshot}"
  echo "${name}: ${screenshot}"
}

echo "Verifying normal launch on a fresh install..."
capture_route "01-normal-launch" 

echo "Verifying DEBUG capture home route..."
capture_route "02-open-capture-home" -open-capture-home

echo "Verifying seeded live camera route..."
capture_route "03-open-live-camera-with-seeded-photo" -open-live-camera-with-seeded-photo

echo "Verifying mock intake flow route..."
capture_route "04-open-mock-intake-flow" -open-mock-intake-flow

echo "Verifying input lab route..."
capture_route "05-open-input-lab" -open-input-lab

echo ""
echo "Done. Screenshots:"
ls -1 "${OUTPUT_DIR}"
