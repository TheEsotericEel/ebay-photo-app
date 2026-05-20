#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f "logs/ios-live.log" ]]; then
  echo "logs/ios-live.log not found. Run scripts/ios-tail-sim-logs.sh first."
  exit 1
fi

tail -n 300 "logs/ios-live.log" | pbcopy
echo "Copied last 300 lines from logs/ios-live.log to clipboard."
