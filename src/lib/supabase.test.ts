import { describe, it, expect, vi, afterEach } from 'vitest';

describe('supabase client setup', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists missing settings and refuses to hand out a client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'key');
    vi.resetModules();
    const { missingSupabaseEnv, supabase, getSupabase } = await import('./supabase');
    expect(missingSupabaseEnv).toEqual(['VITE_SUPABASE_URL']);
    expect(supabase).toBeNull();
    expect(() => getSupabase()).toThrow('Supabase is not configured (missing VITE_SUPABASE_URL)');
  });

  it('creates a client when both settings are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'key');
    vi.resetModules();
    const { missingSupabaseEnv, getSupabase } = await import('./supabase');
    expect(missingSupabaseEnv).toEqual([]);
    expect(getSupabase()).toBeDefined();
  });
});
