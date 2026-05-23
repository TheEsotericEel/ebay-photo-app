-- Phase 1.5: same-workspace parent/child integrity
-- Ensures child rows cannot reference parents from a different workspace_id.

-- 1. Repair denormalized workspace_id and parent ids from authoritative parent chain.
update public.batches b
set workspace_id = s.workspace_id
from public.stores s
where b.store_id = s.id
  and b.workspace_id is distinct from s.workspace_id;

update public.items i
set
  workspace_id = b.workspace_id,
  store_id = b.store_id
from public.batches b
where i.batch_id = b.id
  and (
    i.workspace_id is distinct from b.workspace_id
    or i.store_id is distinct from b.store_id
  );

update public.photos p
set
  workspace_id = i.workspace_id,
  batch_id = i.batch_id,
  store_id = i.store_id
from public.items i
where p.item_id = i.id
  and (
    p.workspace_id is distinct from i.workspace_id
    or p.batch_id is distinct from i.batch_id
    or p.store_id is distinct from i.store_id
  );

update public.photo_variants pv
set workspace_id = p.workspace_id
from public.photos p
where pv.photo_id = p.id
  and pv.workspace_id is distinct from p.workspace_id;

update public.upload_jobs uj
set workspace_id = p.workspace_id
from public.photos p
where uj.photo_id = p.id
  and uj.workspace_id is distinct from p.workspace_id;

-- 2. Fail migration if cross-workspace references remain after repair.
do $$
declare
  batch_mismatch integer;
  item_mismatch integer;
  photo_mismatch integer;
  variant_mismatch integer;
  job_mismatch integer;
begin
  select count(*) into batch_mismatch
  from public.batches b
  join public.stores s on s.id = b.store_id
  where b.workspace_id is distinct from s.workspace_id;

  select count(*) into item_mismatch
  from public.items i
  join public.batches b on b.id = i.batch_id
  where i.workspace_id is distinct from b.workspace_id
     or i.store_id is distinct from b.store_id;

  select count(*) into photo_mismatch
  from public.photos p
  join public.items i on i.id = p.item_id
  where p.workspace_id is distinct from i.workspace_id
     or p.batch_id is distinct from i.batch_id
     or p.store_id is distinct from i.store_id;

  select count(*) into variant_mismatch
  from public.photo_variants pv
  join public.photos p on p.id = pv.photo_id
  where pv.workspace_id is distinct from p.workspace_id;

  select count(*) into job_mismatch
  from public.upload_jobs uj
  join public.photos p on p.id = uj.photo_id
  where uj.workspace_id is distinct from p.workspace_id;

  if batch_mismatch > 0
     or item_mismatch > 0
     or photo_mismatch > 0
     or variant_mismatch > 0
     or job_mismatch > 0 then
    raise exception
      'workspace integrity repair incomplete: batches=%, items=%, photos=%, variants=%, jobs=%',
      batch_mismatch, item_mismatch, photo_mismatch, variant_mismatch, job_mismatch;
  end if;
end
$$;

-- 3. Composite parent identity (required for composite foreign keys).
alter table public.stores
  add constraint stores_id_workspace_id_key unique (id, workspace_id);

alter table public.batches
  add constraint batches_id_workspace_id_key unique (id, workspace_id);

alter table public.items
  add constraint items_id_workspace_id_key unique (id, workspace_id);

alter table public.photos
  add constraint photos_id_workspace_id_key unique (id, workspace_id);

-- 4. Replace single-column FKs with workspace-scoped composite FKs.
alter table public.batches drop constraint if exists batches_store_id_fkey;

alter table public.items drop constraint if exists items_store_id_fkey;
alter table public.items drop constraint if exists items_batch_id_fkey;

alter table public.photos drop constraint if exists photos_store_id_fkey;
alter table public.photos drop constraint if exists photos_batch_id_fkey;
alter table public.photos drop constraint if exists photos_item_id_fkey;

alter table public.photo_variants drop constraint if exists photo_variants_photo_id_fkey;

alter table public.upload_jobs drop constraint if exists upload_jobs_photo_id_fkey;

alter table public.batches
  add constraint batches_store_workspace_fkey
  foreign key (store_id, workspace_id)
  references public.stores (id, workspace_id)
  on delete cascade;

alter table public.items
  add constraint items_batch_workspace_fkey
  foreign key (batch_id, workspace_id)
  references public.batches (id, workspace_id)
  on delete cascade;

alter table public.items
  add constraint items_store_workspace_fkey
  foreign key (store_id, workspace_id)
  references public.stores (id, workspace_id)
  on delete cascade;

alter table public.photos
  add constraint photos_item_workspace_fkey
  foreign key (item_id, workspace_id)
  references public.items (id, workspace_id)
  on delete cascade;

alter table public.photos
  add constraint photos_batch_workspace_fkey
  foreign key (batch_id, workspace_id)
  references public.batches (id, workspace_id)
  on delete cascade;

alter table public.photos
  add constraint photos_store_workspace_fkey
  foreign key (store_id, workspace_id)
  references public.stores (id, workspace_id)
  on delete cascade;

alter table public.photo_variants
  add constraint photo_variants_photo_workspace_fkey
  foreign key (photo_id, workspace_id)
  references public.photos (id, workspace_id)
  on delete cascade;

alter table public.upload_jobs
  add constraint upload_jobs_photo_workspace_fkey
  foreign key (photo_id, workspace_id)
  references public.photos (id, workspace_id)
  on delete cascade;

comment on constraint batches_store_workspace_fkey on public.batches is
  'Batch store_id must belong to the same workspace_id.';

comment on constraint items_batch_workspace_fkey on public.items is
  'Item batch_id must belong to the same workspace_id.';

comment on constraint photos_item_workspace_fkey on public.photos is
  'Photo item_id must belong to the same workspace_id.';
