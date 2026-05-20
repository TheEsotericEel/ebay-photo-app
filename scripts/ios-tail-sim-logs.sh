#!/usr/bin/env bash
set -euo pipefail

mkdir -p logs

BUNDLE_ID="${1:-com.joesprojects.ebayphotoapp}"

echo "Streaming unified logs for subsystem: ${BUNDLE_ID}"
echo "Writing to logs/ios-live.log"

xcrun simctl spawn booted log stream \
  --style compact \
  --level debug \
  --predicate "subsystem == '${BUNDLE_ID}'" \
  2>&1 | tee logs/ios-live.log
