-- Optional dev fixtures (run as superuser; bypasses RLS).
-- Signed-in users receive their own workspace via provision_user_workspace / signup trigger.
-- Legacy fixture rows live in DEV_LEGACY_WORKSPACE and are not visible to normal members.

insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Dev legacy workspace')
on conflict (id) do nothing;

insert into public.stores (id, name, short_code, workspace_id)
values ('11111111-1111-1111-1111-111111111111', 'Default Store', 'DEF', '00000000-0000-0000-0000-000000000001')
on conflict (id) do update
set workspace_id = excluded.workspace_id;

insert into public.batches (id, store_id, name, status, upload_status, remote_retention_mode, workspace_id, started_at)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Current Batch',
  'active',
  'local',
  'delete_7d_after_listed',
  '00000000-0000-0000-0000-000000000001',
  now()
)
on conflict (id) do update
set workspace_id = excluded.workspace_id;
