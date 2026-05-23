import type { SupabaseClient } from '@supabase/supabase-js'

/** Dev/seed fixture workspace; not assigned to real users via signup. */
export const DEV_LEGACY_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Returns the signed-in user's workspace id, provisioning profile/workspace/store/batch if missing.
 */
export async function ensureActiveWorkspaceId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc('provision_user_workspace')
  if (error) {
    throw error
  }
  if (!data || typeof data !== 'string') {
    throw new Error('provision_user_workspace returned no workspace id')
  }
  return data
}
