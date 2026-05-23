-- Phase 1: account/workspace foundation (dev-mode clean migration)
-- See docs/PUBLISHABLE_MVP_FOUNDATION.md

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

-- Fixed id for backfilling pre-migration rows and optional seed fixtures (not user workspaces).
insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Dev legacy workspace')
on conflict (id) do nothing;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

-- workspace_id on business tables
alter table public.stores add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.batches add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.items add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.photos add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.photo_variants add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.upload_jobs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.stores set workspace_id = '00000000-0000-0000-0000-000000000001' where workspace_id is null;
update public.batches b set workspace_id = s.workspace_id from public.stores s where b.store_id = s.id and b.workspace_id is null;
update public.items i set workspace_id = s.workspace_id from public.stores s where i.store_id = s.id and i.workspace_id is null;
update public.photos p set workspace_id = s.workspace_id from public.stores s where p.store_id = s.id and p.workspace_id is null;
update public.photo_variants pv set workspace_id = p.workspace_id from public.photos p where pv.photo_id = p.id and pv.workspace_id is null;
update public.upload_jobs uj set workspace_id = p.workspace_id from public.photos p where uj.photo_id = p.id and uj.workspace_id is null;

alter table public.stores alter column workspace_id set not null;
alter table public.batches alter column workspace_id set not null;
alter table public.items alter column workspace_id set not null;
alter table public.photos alter column workspace_id set not null;
alter table public.photo_variants alter column workspace_id set not null;
alter table public.upload_jobs alter column workspace_id set not null;

create index if not exists stores_workspace_id_idx on public.stores (workspace_id);
create index if not exists batches_workspace_id_idx on public.batches (workspace_id);
create index if not exists items_workspace_id_idx on public.items (workspace_id);
create index if not exists photos_workspace_id_idx on public.photos (workspace_id);
create index if not exists photo_variants_workspace_id_idx on public.photo_variants (workspace_id);
create index if not exists upload_jobs_workspace_id_idx on public.upload_jobs (workspace_id);

alter table public.stores drop constraint if exists stores_short_code_key;
alter table public.stores add constraint stores_workspace_short_code_key unique (workspace_id, short_code);

-- Membership helper for RLS
create or replace function public.user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

revoke all on function public.user_workspace_ids() from public;
grant execute on function public.user_workspace_ids() to authenticated;

create or replace function public.provision_user_workspace_for_id(
  uid uuid,
  display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  sid uuid;
begin
  insert into public.profiles (id, display_name)
  values (uid, display_name)
  on conflict (id) do update set display_name = coalesce(excluded.display_name, public.profiles.display_name);

  select wm.workspace_id into wid
  from public.workspace_members wm
  where wm.user_id = uid
  order by wm.created_at asc
  limit 1;

  if wid is not null then
    return wid;
  end if;

  insert into public.workspaces (name)
  values ('My workspace')
  returning id into wid;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (wid, uid, 'owner');

  insert into public.stores (name, short_code, workspace_id)
  values ('Default Store', 'DEF', wid)
  returning id into sid;

  insert into public.batches (store_id, name, status, upload_status, remote_retention_mode, workspace_id, started_at)
  values (sid, 'Current Batch', 'active', 'local', 'delete_7d_after_listed', wid, now());

  return wid;
end;
$$;

revoke all on function public.provision_user_workspace_for_id(uuid, text) from public;
grant execute on function public.provision_user_workspace_for_id(uuid, text) to service_role;

-- Provision workspace for auth users (login fallback for users created before this migration)
create or replace function public.provision_user_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  return public.provision_user_workspace_for_id(uid, null);
end;
$$;

revoke all on function public.provision_user_workspace() from public;
grant execute on function public.provision_user_workspace() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.provision_user_workspace_for_id(
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS on identity tables
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Members can read workspace" on public.workspaces;
create policy "Members can read workspace"
  on public.workspaces for select to authenticated
  using (id in (select public.user_workspace_ids()));

drop policy if exists "Members can update workspace" on public.workspaces;
create policy "Members can update workspace"
  on public.workspaces for update to authenticated
  using (id in (select public.user_workspace_ids()))
  with check (id in (select public.user_workspace_ids()));

drop policy if exists "Users can create workspace" on public.workspaces;
create policy "Users can create workspace"
  on public.workspaces for insert to authenticated
  with check (true);

drop policy if exists "Members can read workspace membership" on public.workspace_members;
create policy "Members can read workspace membership"
  on public.workspace_members for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Users can insert own membership" on public.workspace_members;
create policy "Users can insert own membership"
  on public.workspace_members for insert to authenticated
  with check (user_id = auth.uid());

-- Replace permissive business-table policies
drop policy if exists "Authenticated users can manage stores" on public.stores;
drop policy if exists "Authenticated users can manage batches" on public.batches;
drop policy if exists "Authenticated users can manage items" on public.items;
drop policy if exists "Authenticated users can manage photos" on public.photos;
drop policy if exists "Authenticated users can manage photo variants" on public.photo_variants;
drop policy if exists "Authenticated users can manage upload jobs" on public.upload_jobs;

drop policy if exists "Workspace members manage stores" on public.stores;
create policy "Workspace members manage stores"
  on public.stores for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Workspace members manage batches" on public.batches;
create policy "Workspace members manage batches"
  on public.batches for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Workspace members manage items" on public.items;
create policy "Workspace members manage items"
  on public.items for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Workspace members manage photos" on public.photos;
create policy "Workspace members manage photos"
  on public.photos for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Workspace members manage photo variants" on public.photo_variants;
create policy "Workspace members manage photo variants"
  on public.photo_variants for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));

drop policy if exists "Workspace members manage upload jobs" on public.upload_jobs;
create policy "Workspace members manage upload jobs"
  on public.upload_jobs for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));
