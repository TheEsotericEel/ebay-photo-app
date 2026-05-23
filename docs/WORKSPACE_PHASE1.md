# Workspace Phase 1 (Dev)

**Status:** Implemented  
**Last updated:** 05/22/2026  
**North star:** [`PUBLISHABLE_MVP_FOUNDATION.md`](PUBLISHABLE_MVP_FOUNDATION.md)

## What shipped

- Supabase migration [`supabase/migrations/20260522000000_workspace_foundation.sql`](../supabase/migrations/20260522000000_workspace_foundation.sql):
  - `profiles`, `workspaces`, `workspace_members`
  - `workspace_id NOT NULL` on `stores`, `batches`, `items`, `photos`, `photo_variants`, `upload_jobs`
  - `UNIQUE (workspace_id, short_code)` on stores
  - Membership RLS (replaces permissive authenticated policies)
  - `provision_user_workspace()` RPC + signup trigger
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
