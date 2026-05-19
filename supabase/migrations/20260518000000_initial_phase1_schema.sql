-- Phase 1 base schema for the eBay photo handoff app.
-- This schema is intentionally shaped around the spec:
-- stores -> batches -> items -> photos -> variants/jobs

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'ready_for_listing', 'archived')),
  upload_status text not null default 'local' check (upload_status in ('local', 'partial', 'uploaded', 'failed')),
  item_count integer not null default 0,
  photo_count integer not null default 0,
  upload_completed_at timestamptz,
  local_cleanup_completed_at timestamptz,
  remote_retention_mode text not null default 'delete_7d_after_listed' check (
    remote_retention_mode in (
      'manual',
      'delete_24h_after_listed',
      'delete_3d_after_listed',
      'delete_7d_after_listed',
      'delete_7d_after_upload',
      'delete_7d_after_batch_complete'
    )
  ),
  remote_retention_days integer,
  remote_expires_at timestamptz,
  remote_deleted_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batches_store_id_idx on public.batches (store_id);
create index if not exists batches_status_idx on public.batches (status);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  sequence integer not null,
  status text not null default 'new' check (status in ('new', 'listed', 'hold', 'needs_retake')),
  main_photo_id uuid,
  sku text,
  notes text,
  weight text,
  title_hint text,
  dimensions text,
  listing_hint text,
  listing_intent text not null default 'unknown' check (listing_intent in ('single', 'lot', 'bundle', 'unknown')),
  tags jsonb not null default '[]'::jsonb,
  listed_at timestamptz,
  listed_by text,
  photo_retention_until timestamptz,
  photos_cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, sequence)
);

create index if not exists items_store_id_idx on public.items (store_id);
create index if not exists items_batch_id_idx on public.items (batch_id);
create index if not exists items_status_idx on public.items (status);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  order_index integer not null default 0,
  local_status text not null default 'present' check (local_status in ('present', 'safe_to_clear', 'cleared', 'missing')),
  upload_status text not null default 'local' check (upload_status in ('local', 'uploading', 'uploaded', 'failed')),
  remote_status text not null default 'not_uploaded' check (remote_status in ('not_uploaded', 'uploaded', 'verified', 'delete_eligible', 'deleting', 'deleted', 'failed')),
  captured_at timestamptz not null default now(),
  remote_verified_at timestamptz,
  local_cleared_at timestamptz,
  remote_expires_at timestamptz,
  remote_delete_eligible_at timestamptz,
  remote_deleted_at timestamptz,
  upload_attempt_count integer not null default 0,
  last_upload_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photos_store_id_idx on public.photos (store_id);
create index if not exists photos_batch_id_idx on public.photos (batch_id);
create index if not exists photos_item_id_idx on public.photos (item_id);
create index if not exists photos_remote_status_idx on public.photos (remote_status);

create table if not exists public.photo_variants (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  variant_type text not null check (variant_type in ('original', 'listing', 'thumbnail')),
  storage_bucket text not null,
  storage_key text not null,
  width integer,
  height integer,
  bytes bigint,
  mime_type text,
  checksum text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  remote_expires_at timestamptz,
  remote_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (photo_id, variant_type)
);

create index if not exists photo_variants_photo_id_idx on public.photo_variants (photo_id);
create index if not exists photo_variants_bucket_key_idx on public.photo_variants (storage_bucket, storage_key);

create table if not exists public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  variant_type text not null check (variant_type in ('listing', 'thumbnail', 'original')),
  status text not null default 'queued' check (status in ('queued', 'uploading', 'uploaded', 'failed')),
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upload_jobs_photo_id_idx on public.upload_jobs (photo_id);
create index if not exists upload_jobs_status_idx on public.upload_jobs (status);

drop trigger if exists set_stores_updated_at on public.stores;
create trigger set_stores_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

drop trigger if exists set_batches_updated_at on public.batches;
create trigger set_batches_updated_at
before update on public.batches
for each row execute function public.set_updated_at();

drop trigger if exists set_items_updated_at on public.items;
create trigger set_items_updated_at
before update on public.items
for each row execute function public.set_updated_at();

drop trigger if exists set_photos_updated_at on public.photos;
create trigger set_photos_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

drop trigger if exists set_photo_variants_updated_at on public.photo_variants;
create trigger set_photo_variants_updated_at
before update on public.photo_variants
for each row execute function public.set_updated_at();

drop trigger if exists set_upload_jobs_updated_at on public.upload_jobs;
create trigger set_upload_jobs_updated_at
before update on public.upload_jobs
for each row execute function public.set_updated_at();

alter table public.stores enable row level security;
alter table public.batches enable row level security;
alter table public.items enable row level security;
alter table public.photos enable row level security;
alter table public.photo_variants enable row level security;
alter table public.upload_jobs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'stores'
      and policyname = 'Authenticated users can manage stores'
  ) then
    create policy "Authenticated users can manage stores"
      on public.stores
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'batches'
      and policyname = 'Authenticated users can manage batches'
  ) then
    create policy "Authenticated users can manage batches"
      on public.batches
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'items'
      and policyname = 'Authenticated users can manage items'
  ) then
    create policy "Authenticated users can manage items"
      on public.items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'photos'
      and policyname = 'Authenticated users can manage photos'
  ) then
    create policy "Authenticated users can manage photos"
      on public.photos
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_variants'
      and policyname = 'Authenticated users can manage photo variants'
  ) then
    create policy "Authenticated users can manage photo variants"
      on public.photo_variants
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'upload_jobs'
      and policyname = 'Authenticated users can manage upload jobs'
  ) then
    create policy "Authenticated users can manage upload jobs"
      on public.upload_jobs
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-assets',
  'photo-assets',
  false,
  52428800,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read photo assets'
  ) then
    create policy "Authenticated users can read photo assets"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'photo-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload photo assets'
  ) then
    create policy "Authenticated users can upload photo assets"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'photo-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update photo assets'
  ) then
    create policy "Authenticated users can update photo assets"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'photo-assets')
      with check (bucket_id = 'photo-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete photo assets'
  ) then
    create policy "Authenticated users can delete photo assets"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'photo-assets');
  end if;
end
$$;
