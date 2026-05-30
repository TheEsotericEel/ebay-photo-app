#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${ROOT}/ios/EbayPhotoApp.xcodeproj"
SCHEME="EbayPhotoApp"
PREFERRED_DEVICE_NAME="${PREFERRED_DEVICE_NAME:-Smoke iPhone 17 Pro}"
RUN_DIR="${RUN_DIR:-${ROOT}/tmp/test-runs/ios-smoke-$(date +%Y%m%d-%H%M%S)}"
RESULT_BUNDLE="${RUN_DIR}/result.xcresult"
XCODEBUILD_LOG="${RUN_DIR}/xcodebuild.log"
SIMULATOR_LOG="${RUN_DIR}/simulator.log"
SCREENSHOT_DIR="${RUN_DIR}/screenshots"
DESTINATION_ID=""
LOG_STREAM_PID=""
STATUS=0

mkdir -p "${SCREENSHOT_DIR}"

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

cleanup() {
  if [[ -n "${LOG_STREAM_PID}" ]]; then
    kill "${LOG_STREAM_PID}" >/dev/null 2>&1 || true
    wait "${LOG_STREAM_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

DEVICE_ID="$(resolve_device || true)"
if [[ -z "${DEVICE_ID}" ]]; then
  echo "No suitable iPhone simulator is available."
  exit 1
fi

DESTINATION_ID="${DEVICE_ID}"

echo "Preparing simulator ${DEVICE_ID}..."
xcrun simctl shutdown "${DEVICE_ID}" >/dev/null 2>&1 || true
xcrun simctl erase "${DEVICE_ID}" >/dev/null 2>&1 || true
xcrun simctl boot "${DEVICE_ID}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${DEVICE_ID}" -b >/dev/null
xcrun simctl privacy "${DEVICE_ID}" grant camera com.joesprojects.ebayphotoapp >/dev/null 2>&1 || true

echo "Starting simulator log stream..."
xcrun simctl spawn "${DEVICE_ID}" log stream \
  --style compact \
  --level debug \
  --predicate 'process == "EbayPhotoApp" || subsystem CONTAINS "EbayPhotoApp"' \
  > "${SIMULATOR_LOG}" 2>&1 &
LOG_STREAM_PID=$!

echo "Running iOS smoke tests..."
set +e
xcodebuild test \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -destination "platform=iOS Simulator,id=${DESTINATION_ID}" \
  -resultBundlePath "${RESULT_BUNDLE}" \
  -only-testing:EbayPhotoAppUITests/testFreshLaunchShowsAuthView \
  -only-testing:EbayPhotoAppUITests/testOpenCaptureHomeRouteShowsCaptureHome \
  -only-testing:EbayPhotoAppUITests/testSeededLiveCameraRouteShowsStableCameraState \
  ARCHS=arm64 | tee "${XCODEBUILD_LOG}"
STATUS=${PIPESTATUS[0]}
set -e

if [[ -d "${RESULT_BUNDLE}" ]]; then
  xcrun xcresulttool export attachments \
    --path "${RESULT_BUNDLE}" \
    --output-path "${SCREENSHOT_DIR}" \
    >/dev/null 2>&1 || true
fi

if xcrun simctl io "${DEVICE_ID}" screenshot "${SCREENSHOT_DIR}/post-test-state.png" >/dev/null 2>&1; then
  echo "Saved simulator screenshot: ${SCREENSHOT_DIR}/post-test-state.png"
fi

if [[ ! -s "${SIMULATOR_LOG}" ]]; then
  echo "Simulator log stream did not produce output." > "${SIMULATOR_LOG}"
fi

echo "Smoke run folder: ${RUN_DIR}"
echo "Result bundle: ${RESULT_BUNDLE}"
echo "Xcode log: ${XCODEBUILD_LOG}"
echo "Simulator log: ${SIMULATOR_LOG}"
echo "Screenshots: ${SCREENSHOT_DIR}"

exit "${STATUS}"
