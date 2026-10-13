import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Names of required env vars that are missing from this build. */
export const missingSupabaseEnv = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
].filter((name): name is string => Boolean(name));

// createClient throws on an empty URL, which would blank the page before
// React can render anything; App shows a config error instead.
export const supabase: SupabaseClient | null =
  missingSupabaseEnv.length === 0 ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(`Supabase is not configured (missing ${missingSupabaseEnv.join(', ')})`);
  }
  return supabase;
}
