-- Phase 1.1: tighten workspace membership RLS (publishable-safe boundaries)
-- Membership and workspace rows must be created only via security-definer provisioning RPCs.

drop policy if exists "Users can insert own membership" on public.workspace_members;

drop policy if exists "Users can create workspace" on public.workspaces;

-- Authenticated clients: read/update workspaces they belong to; no direct INSERT.
-- workspace_members: SELECT only; INSERT/UPDATE/DELETE via provision_user_workspace* (security definer).

comment on table public.workspace_members is
  'Membership rows are created by security-definer provision_user_workspace / provision_user_workspace_for_id only.';

comment on table public.workspaces is
  'Workspace rows are created by security-definer provisioning functions only (not direct client INSERT).';
