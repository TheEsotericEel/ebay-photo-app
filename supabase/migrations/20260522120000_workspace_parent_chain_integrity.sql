-- Phase 1.6: parent-chain integrity within workspace
-- Tightens denormalized parent chain consistency after Phase 1.5 same-workspace FKs.
--
-- Goals:
-- - items: (batch_id, store_id, workspace_id) must match the referenced batch row.
-- - photos: (item_id, batch_id, store_id, workspace_id) must match the referenced item row.

-- 1) Repair denormalized chain fields from authoritative parents.
update public.items i
set
  store_id = b.store_id,
  workspace_id = b.workspace_id
from public.batches b
where i.batch_id = b.id
  and (
    i.store_id is distinct from b.store_id
    or i.workspace_id is distinct from b.workspace_id
  );

update public.photos p
set
  batch_id = i.batch_id,
  store_id = i.store_id,
  workspace_id = i.workspace_id
from public.items i
where p.item_id = i.id
  and (
    p.batch_id is distinct from i.batch_id
    or p.store_id is distinct from i.store_id
    or p.workspace_id is distinct from i.workspace_id
  );

-- 2) Fail migration if mismatches remain after repair.
do $$
declare
  item_chain_mismatch integer;
  photo_chain_mismatch integer;
begin
  select count(*) into item_chain_mismatch
  from public.items i
  join public.batches b on b.id = i.batch_id
  where i.store_id is distinct from b.store_id
     or i.workspace_id is distinct from b.workspace_id;

  select count(*) into photo_chain_mismatch
  from public.photos p
  join public.items i on i.id = p.item_id
  where p.batch_id is distinct from i.batch_id
     or p.store_id is distinct from i.store_id
     or p.workspace_id is distinct from i.workspace_id;

  if item_chain_mismatch > 0 or photo_chain_mismatch > 0 then
    raise exception
      'parent-chain integrity repair incomplete: items=%, photos=%',
      item_chain_mismatch, photo_chain_mismatch;
  end if;
end
$$;

-- 3) Add composite unique constraints required for chain FKs.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'batches_id_store_workspace_key'
      and conrelid = 'public.batches'::regclass
  ) then
    alter table public.batches
      add constraint batches_id_store_workspace_key
      unique (id, store_id, workspace_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_id_batch_store_workspace_key'
      and conrelid = 'public.items'::regclass
  ) then
    alter table public.items
      add constraint items_id_batch_store_workspace_key
      unique (id, batch_id, store_id, workspace_id);
  end if;
end
$$;

-- 4) Replace weak same-workspace FKs with strict parent-chain FKs.
alter table public.items
  drop constraint if exists items_batch_workspace_fkey;

alter table public.items
  drop constraint if exists items_batch_store_workspace_fkey;

alter table public.items
  add constraint items_batch_store_workspace_fkey
  foreign key (batch_id, store_id, workspace_id)
  references public.batches (id, store_id, workspace_id)
  on delete cascade;

alter table public.photos
  drop constraint if exists photos_item_workspace_fkey;

alter table public.photos
  drop constraint if exists photos_item_batch_store_workspace_fkey;

alter table public.photos
  add constraint photos_item_batch_store_workspace_fkey
  foreign key (item_id, batch_id, store_id, workspace_id)
  references public.items (id, batch_id, store_id, workspace_id)
  on delete cascade;

comment on constraint items_batch_store_workspace_fkey on public.items is
  'Item batch_id, store_id, workspace_id must match the referenced batch row.';

comment on constraint photos_item_batch_store_workspace_fkey on public.photos is
  'Photo item_id, batch_id, store_id, workspace_id must match the referenced item row.';
