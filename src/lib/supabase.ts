import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfig = {
  url: supabaseUrl || null,
  anonKey: supabaseAnonKey || null,
  ready: Boolean(supabaseUrl && supabaseAnonKey),
}

export const supabase = supabaseConfig.ready
  ? createClient(supabaseConfig.url as string, supabaseConfig.anonKey as string)
  : null
