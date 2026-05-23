# Workspace Phase 1 (Dev)

**Status:** Implemented  
**Last updated:** 05/22/2026 (RLS membership hardening)  
**North star:** [`PUBLISHABLE_MVP_FOUNDATION.md`](PUBLISHABLE_MVP_FOUNDATION.md)

## What shipped

- Supabase migration [`supabase/migrations/20260522000000_workspace_foundation.sql`](../supabase/migrations/20260522000000_workspace_foundation.sql):
  - `profiles`, `workspaces`, `workspace_members`
  - `workspace_id NOT NULL` on `stores`, `batches`, `items`, `photos`, `photo_variants`, `upload_jobs`
  - `UNIQUE (workspace_id, short_code)` on stores
  - Membership RLS (replaces permissive authenticated policies)
  - `provision_user_workspace()` RPC + signup trigger
- Follow-up migration [`20260522100000_workspace_rls_membership_hardening.sql`](../supabase/migrations/20260522100000_workspace_rls_membership_hardening.sql): no direct client INSERT on `workspaces` or `workspace_members` (provisioning only via security-definer RPCs)
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

Apply both workspace migrations if upgrading an existing DB:

```bash
supabase db push   # includes 20260522000000 + 20260522100000
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

## Phase 1.5 follow-up (before tombstones / delete)

**Same-workspace parent/child integrity** — RLS checks `workspace_id` on each row but does not yet prevent mismatched FKs (e.g. batch in workspace A pointing at store in workspace B).

Target (composite unique + FK):

```sql
-- Parent tables
alter table stores add unique (id, workspace_id);
alter table batches add unique (id, workspace_id);
alter table items add unique (id, workspace_id);
alter table photos add unique (id, workspace_id);

-- Child FKs include workspace_id
alter table batches
  add foreign key (store_id, workspace_id)
  references stores (id, workspace_id);

alter table items
  add foreign key (batch_id, workspace_id)
  references batches (id, workspace_id);

alter table photos
  add foreign key (item_id, workspace_id)
  references items (id, workspace_id);

alter table photo_variants
  add foreign key (photo_id, workspace_id)
  references photos (id, workspace_id);
```

Alternatively: `BEFORE INSERT OR UPDATE` triggers on child tables that assert `parent.workspace_id = NEW.workspace_id`.

**Storage RLS** — before public release, scope `storage.objects` policies to workspace membership + path prefix (`workspaces/{workspaceId}/...`), not bucket-wide authenticated access.

## Security model (membership)

| Action | Allowed path |
| --- | --- |
| Create workspace + owner membership | `provision_user_workspace()`, `provision_user_workspace_for_id()`, auth signup trigger only |
| Read workspace / membership | RLS: member of workspace |
| Client INSERT `workspace_members` | **Denied** |
| Client INSERT `workspaces` | **Denied** |
| Future: invite / second workspace | New security-definer RPC (e.g. `create_workspace()`) — not open table insert |
