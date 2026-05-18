# Phase 1 Notes

Phase 1 moves the app from camera spike into the first real handoff workflow.

## Added in this repo

- store and batch records in IndexedDB
- queue-oriented Phase 1 screen
- Supabase Auth magic-link bootstrap
- batch sync into Supabase tables and private storage
- desktop store queue with batch drilldown and item detail
- single shared account across capture and lister devices
- retention dates and remote cleanup for listed items
- item listing status controls
- default store and batch seed data

## Still to build

- stronger remote verification and safe-to-clear logic for unusual edge cases
- remote photo retention dates for more batch states beyond listed items
- richer remote cleanup automation for scheduled deletion
