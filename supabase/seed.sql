insert into public.stores (id, name, short_code)
values ('11111111-1111-1111-1111-111111111111', 'Default Store', 'DEF')
on conflict (id) do nothing;

insert into public.batches (id, store_id, name, status, upload_status, remote_retention_mode, started_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Current Batch', 'active', 'local', 'delete_7d_after_listed', now())
on conflict (id) do nothing;
