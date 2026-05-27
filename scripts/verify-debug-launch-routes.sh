#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${ROOT}/ios/EbayPhotoApp.xcodeproj"
SCHEME="EbayPhotoApp"
DESTINATION="${DESTINATION:-platform=iOS Simulator,name=Smoke iPhone 17 Pro}"
DERIVED_DATA="${DERIVED_DATA:-${ROOT}/tmp/DerivedData-debug-routes}"
DEVICE="${DEVICE:-booted}"
BUNDLE_ID="com.joesprojects.ebayphotoapp"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT}/tmp/debug-launch-routes}"
APP="${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/EbayPhotoApp.app"

mkdir -p "${OUTPUT_DIR}"

echo "Building Debug app..."
xcodebuild \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration Debug \
  -destination "${DESTINATION}" \
  -derivedDataPath "${DERIVED_DATA}" \
  build -quiet

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
