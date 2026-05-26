# iOS Item Intake Flow Plan

**Status:** Planned flow
**Last updated:** 2026-05-24
**Purpose:** Define the minimal next intake flow for native iOS before production wiring changes.

## Decision

Move item intake out of the live camera screen.

The camera remains photo-first. Item notes move to a lightweight checkpoint after capture. For the first pass, that checkpoint contains one expandable `Notes` field only.

This is not a listing form. Do not add SKU, weight, dimensions, validation, category-specific fields, reorder tools, or upload redesign in this slice.

## Minimal Flow

```txt
Camera
→ photo
→ photo
→ photo
→ Next

Finish Item
→ optional Notes field
→ Done or Next Item

Next Item
→ queue current item
→ clear current draft
→ increment item number
→ return to camera

Done
→ queue current item
→ open Queue Review

Queue Review
→ item cards
→ tap item card

Item Review
→ photos
→ notes
```

## State Terms

- `current draft`: the active in-camera item before queueing
- `queued item packet`: local finalized item ready for later upload
- `submitted remote item`: Supabase-backed item after explicit queue upload

`Upload Batch` / `Submit Queue` should operate on finalized queued item packets only. Current draft items are not remote items.

## Screen Scope

### Camera

Keep:

- photo capture
- current item number
- photo count
- `Next`

Remove from the main capture flow for now:

- inline metadata tray
- SKU
- weight
- dimensions
- inline notes editing

### Finish Item

Required:

- current item number
- captured photo count
- one expandable `Notes` field
- `Done`
- `Next Item`

The Finish Item sheet is a checkpoint for item boundaries and optional quick details, not a required listing form. The user must be able to queue a photo-only item.

### Queue Review

Required:

- item cards
- photo count
- notes preview
- tap card to open item review

### Item Review

Required:

- item number
- item photos
- notes

## Done Behavior

In the planned production flow:

- `Done` on the Finish Item screen queues the current item and opens Queue Review.
- Camera `Done` behavior should be revisited when the real flow is wired.
- If the current draft has captured photos, camera `Done` should not silently discard them.

## Phase Plan

### Phase 1: Mock only

Build static SwiftUI mock screens to validate:

- photo-first camera screen
- notes-only Finish Item screen
- Queue Review item cards
- simple item review page

Use four placeholder photos per item so item cards and review layout can be evaluated.

No real queue mutation, upload, persistence, or camera behavior changes are required in this phase.

### Phase 2: Wire existing state

After the mock flow is approved:

- camera `Next` opens Finish Item
- `Notes` writes to `currentItemNotes`
- `Next Item` finalizes the current draft and returns to camera
- `Done` finalizes the current draft and opens Queue Review

### Phase 3: Remove inline intake

After the new flow is working:

- remove the inline metadata tray from the normal capture path
- keep the implementation minimal
- do not redesign upload or backend behavior in the same slice

## Non-Goals

Do not add these yet:

- SKU / weight / dimensions on the Finish Item page
- required notes
- validation rules
- fast mode
- queue redesign beyond cards and item review
- photo reorder or delete tools on Finish Item
- upload behavior changes
- backend schema changes
