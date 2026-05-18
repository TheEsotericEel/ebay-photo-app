# Workspace Notes

This workspace moves the app from camera spike into the first real handoff workflow.
The current implementation is split into a mobile home screen that opens the camera on demand and a desktop tabbed shell with fixed Capture, Queue, and Tools panels.

## Added in this repo

- store and batch records in IndexedDB
- mobile capture surface with upload/cleanup status
- desktop tabbed shell with batch drilldown, item detail, and upload tools
- Supabase Auth magic-link bootstrap
- batch sync into Supabase tables and private storage
- single shared account across capture and lister devices
- retention dates and remote cleanup for listed items
- item listing status controls
- default store and batch seed data

## Still to build

- stronger remote verification and safe-to-clear logic for unusual edge cases
- remote photo retention dates for more batch states beyond listed items
- richer remote cleanup automation for scheduled deletion
