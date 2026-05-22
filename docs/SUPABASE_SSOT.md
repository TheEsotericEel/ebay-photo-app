# Supabase SSOT and Data Ownership

**Status:** Active architecture reference  
**Last updated:** 05/22/2026

Use this doc when deciding where data lives, which document wins on conflict, and whether a change belongs in schema, contract, or client code.

---

## 1. Three-layer model

| Layer | Role | Platforms |
| --- | --- | --- |
| **Supabase** (Postgres + Storage + Auth) | Source of truth for **shared, durable, cross-device** workflow data **after handoff** | iPhone + desktop |
| **Device-local persistence** | Execution layer: in-progress queues, unsynced edits, cached remote rows, local photo blobs, sync cursors, offline retry | Web: **IndexedDB**. iOS: **Application Support**, local files, queue state JSON |
| **UI state** (React / SwiftUI) | Transient presentation and interaction only | Web + iOS |

Local persistence is **not** the cross-device source of truth. It may be authoritative **on that device** only while work is still local.

---

## 2. Before / after handoff

| Phase | Who is authoritative |
| --- | --- |
| **Before submit or flush** | Device-local queue or edit state for **that device** |
| **After submit or flush** | **Supabase rows** and **Storage objects** for anything another client must trust |

Local copies may remain as cache, retry state, or retained working files, but other devices must read Supabase—not another device’s local store.

**Handoff actions:** iOS **Submit** (item packet upload); desktop **flush** of queued mutations to Supabase.

---

## 3. V1 desktop bridge

- Desktop V1 **may render from IndexedDB**.
- IndexedDB is a **synchronized working copy** (import bridge + local edits + flush), **not** cross-device SSOT.
- **Remote-first** desktop queue reads (UI reads Supabase directly) are **deferred** in V1.

See [`docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/WEB_DESKTOP_APP_SPEC.md`](ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/WEB_DESKTOP_APP_SPEC.md) for the later migration target; V1 behavior follows this hub and [`docs/BACKEND_CONTRACT_V1.md`](BACKEND_CONTRACT_V1.md).

---

## 4. Normative hierarchy

Read in this order when definitions conflict:

1. **`supabase/migrations/`** — schema, tables, checks, RLS, storage buckets (change here first for structural truth).
2. **[`docs/BACKEND_CONTRACT_V1.md`](BACKEND_CONTRACT_V1.md)** — V1 submit/upload shape, required variants (`listing` + `thumbnail`), storage paths, status values, remote ID rules.
3. **[`docs/CROSS_PLATFORM_SYNC_CONTRACT.md`](CROSS_PLATFORM_SYNC_CONTRACT.md)** — sync tiers, field ownership, conflict behavior between platforms.
4. **[`docs/ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/BACKEND_CONTRACT.md`](ios-migration-docs/ebay-photo-app-ios-migration-docs/docs/BACKEND_CONTRACT.md)** — **Reference only** (future-safe / post-V1); **not** V1 implementation authority.

Supporting setup: [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md), [`.env.example`](../.env.example).

---

## 5. Photo ownership

| Phase | SSOT |
| --- | --- |
| **Before upload** | Local photo blobs on the capturing device (working copies) |
| **After upload** | **Supabase Storage** objects + **`photos` / `photo_variants`** metadata |

**Order:** After upload, canonical photo order is **shared data** in Supabase (`photos.order_index` and stable photo IDs). UI display order on any client is **derived** from that metadata, not from local array order alone.

V1 required variants for handoff: `listing` + `thumbnail` only (`original` upload deferred).

---

## 6. Decision checklist

Before implementing a feature or doc change, answer:

1. **Shared across iPhone and desktop?** → If yes, shape belongs in migration + V1 contract (and sync contract if behavior/conflicts matter).
2. **Durable beyond one session?** → If yes and cross-device, Supabase (not only local DB).
3. **Must another device trust it?** → If yes, only after submit/flush; enforce remote IDs and contract paths.
4. **Pre-submit local work or post-submit shared work?** → Local execution layer vs Supabase SSOT.
5. **Schema, status enum, storage path, or variant rule change?** → Update **migration + `BACKEND_CONTRACT_V1.md`** (and sync contract if ownership changes); then align clients.

If all of (1)–(3) are no, keep it device-local or UI-only.

---

## Related docs

- [`docs/BACKEND_CONTRACT_V1.md`](BACKEND_CONTRACT_V1.md)
- [`docs/CROSS_PLATFORM_SYNC_CONTRACT.md`](CROSS_PLATFORM_SYNC_CONTRACT.md)
- [`docs/SUPABASE_SETUP.md`](SUPABASE_SETUP.md)
