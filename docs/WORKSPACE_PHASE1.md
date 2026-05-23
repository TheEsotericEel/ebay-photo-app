# Workspace Phase 1 (Dev)

**Status:** Phase 1 + 1.6 implemented  
**Last updated:** 05/23/2026 (parent-chain workspace integrity)  
**North star:** [`PUBLISHABLE_MVP_FOUNDATION.md`](PUBLISHABLE_MVP_FOUNDATION.md)

## What shipped

- Supabase migration [`supabase/migrations/20260522000000_workspace_foundation.sql`](../supabase/migrations/20260522000000_workspace_foundation.sql):
  - `profiles`, `workspaces`, `workspace_members`
  - `workspace_id NOT NULL` on `stores`, `batches`, `items`, `photos`, `photo_variants`, `upload_jobs`
  - `UNIQUE (workspace_id, short_code)` on stores
  - Membership RLS (replaces permissive authenticated policies)
  - `provision_user_workspace()` RPC + signup trigger
- Follow-up migration [`20260522100000_workspace_rls_membership_hardening.sql`](../supabase/migrations/20260522100000_workspace_rls_membership_hardening.sql): no direct client INSERT on `workspaces` or `workspace_members` (provisioning only via security-definer RPCs)
- Phase 1.5 migration [`20260522110000_workspace_parent_child_integrity.sql`](../supabase/migrations/20260522110000_workspace_parent_child_integrity.sql):
  - Repairs denormalized `workspace_id` / parent ids from parent chain before constraints
  - `UNIQUE (id, workspace_id)` on `stores`, `batches`, `items`, `photos`
  - Composite FKs: child `(parent_id, workspace_id)` → parent `(id, workspace_id)` for batches, items, photos, `photo_variants`, `upload_jobs`
  - Migration fails if cross-workspace mismatches remain after repair
- Phase 1.6 migration [`20260522120000_workspace_parent_chain_integrity.sql`](../supabase/migrations/20260522120000_workspace_parent_chain_integrity.sql):
  - Repairs same-workspace chain mismatches: `items.store_id/workspace_id` from batch; `photos.batch_id/store_id/workspace_id` from item
  - Adds composite unique constraints for strict chain refs:
    - `batches (id, store_id, workspace_id)`
    - `items (id, batch_id, store_id, workspace_id)`
  - Replaces weak chain links with strict chain FKs:
    - `items (batch_id, store_id, workspace_id)` → `batches (id, store_id, workspace_id)`
    - `photos (item_id, batch_id, store_id, workspace_id)` → `items (id, batch_id, store_id, workspace_id)`
  - Migration fails if parent-chain mismatches remain after repair
- Web: [`src/adapters/workspaceContext.ts`](../src/adapters/workspaceContext.ts), workspace-scoped import/upload in [`remoteImport.ts`](../src/adapters/remoteImport.ts) and [`supabaseUpload.ts`](../src/adapters/supabaseUpload.ts)
- iOS: workspace provisioning + scoped REST in [`SupabaseService.swift`](../ios/EbayPhotoApp/Services/SupabaseService.swift)
- Storage paths unchanged (`{storeId}/batches/...`) — bucket policies still allow authenticated access to `photo-assets`

## Manual Supabase steps (dev)

**Recommended (clean):**

```bash
supabase db reset
```

This applies all migrations and runs [`supabase/seed.sql`](../supabase/seed.sql). Seed fixtures live in the **dev legacy workspace** (`00000000-0000-0000-0000-000000000001`) and are **not** visible to normal signed-in users (no membership).

**After reset:**

1. Sign in on web or iOS (creates profile + personal workspace + default store/batch via trigger/RPC).
2. Submit/import uses **your** workspace only (RLS-enforced).

**Existing remote project (without full reset):**

```bash
supabase db push
```

Then sign in once per dev account so `provision_user_workspace()` creates membership. Or call the RPC from the app on first sync.

Apply all workspace integrity migrations if upgrading an existing DB:

```bash
supabase db push   # includes 20260522000000 + 20260522100000 + 20260522110000 + 20260522120000
```

## Dev data options

| Option | When |
| --- | --- |
| **A — Reset** | Preferred; disposable test data |
| **B — Push + provision** | Keep hosted DB; run migration; each user runs `provision_user_workspace` on login |

Legacy rows without a member are backfilled to `Dev legacy workspace` only; users do not see them unless explicitly granted membership.

## Not in this slice

- Tombstone deletes / delete UI
- Workspace-prefixed storage paths (`workspaces/{id}/stores/...`)
- Billing, teams, roles

## Verification

```bash
npm test
npm run build
```

iOS: build in Xcode after Swift changes.

### Manual smoke-test checklist

After `supabase db push` or `supabase db reset`:

1. Sign in on web — confirm `provision_user_workspace()` creates profile, workspace, membership, `DEF` store, `Current Batch`.
2. Submit one item from iOS — confirm `workspace_id` matches on store, batch, item, photos, `photo_variants`.
3. Desktop lister — only sees the signed-in user’s workspace rows.
4. Second test user — cannot read User A’s stores/items (RLS).
5. **Negative test (after hardening migration):** as User B, attempt `INSERT` into `workspace_members` with User A’s `workspace_id` — must **fail** (no direct membership insert policy).
6. **Negative test:** as User B, attempt `INSERT` into `workspaces` — must **fail** (no direct workspace create policy).
7. **Integrity test:** attempt to insert a batch with valid `store_id` but wrong `workspace_id` — must **fail** (composite FK after Phase 1.5).
8. **Chain test:** attempt to insert an item where `batch_id` points to Store 1 but `store_id` is Store 2 in same workspace — must **fail** (strict chain FK after Phase 1.6).
9. **Chain test:** attempt to insert a photo where `item_id` is valid but `batch_id/store_id` do not match that item chain — must **fail** (strict chain FK after Phase 1.6).

## Phase 1.5 — parent/child integrity (implemented)

Database enforces that child rows reference parents in the **same** `workspace_id`:

| Child | Composite FK |
| --- | --- |
| `batches` | `(store_id, workspace_id)` → `stores` |
| `items` | `(batch_id, workspace_id)` → `batches`; `(store_id, workspace_id)` → `stores` |
| `photos` | `(item_id, workspace_id)` → `items`; also batch/store composite FKs |
| `photo_variants` | `(photo_id, workspace_id)` → `photos` |
| `upload_jobs` | `(photo_id, workspace_id)` → `photos` |

Migration repairs mismatched denormalized columns from the parent chain, then aborts if any cross-workspace rows remain.

## Phase 1.6 — strict parent-chain integrity (implemented)

Phase 1.5 enforced same-workspace parent links. Phase 1.6 tightens denormalized chain consistency within a workspace:

| Child | Strict chain FK |
| --- | --- |
| `items` | `(batch_id, store_id, workspace_id)` → `batches (id, store_id, workspace_id)` |
| `photos` | `(item_id, batch_id, store_id, workspace_id)` → `items (id, batch_id, store_id, workspace_id)` |

Migration first repairs denormalized chain fields from parents, then aborts if chain mismatches remain.

## Before public release (still open)

**Storage RLS** — scope `storage.objects` policies to workspace membership + path prefix (`workspaces/{workspaceId}/...`), not bucket-wide authenticated access.

## Security model (membership)

| Action | Allowed path |
| --- | --- |
| Create workspace + owner membership | `provision_user_workspace()`, `provision_user_workspace_for_id()`, auth signup trigger only |
| Read workspace / membership | RLS: member of workspace |
| Client INSERT `workspace_members` | **Denied** |
| Client INSERT `workspaces` | **Denied** |
| Future: invite / second workspace | New security-definer RPC (e.g. `create_workspace()`) — not open table insert |
