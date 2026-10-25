import { vi } from 'vitest';

type AuthCallback = (event: string, session: unknown) => void;

/**
 * A fake Supabase client for App-level tests: auth events are fired by the
 * test, and the progress table is an empty in-memory row that accepts writes.
 */
export function createSupabaseMock() {
  let listener: AuthCallback | null = null;
  let row: Record<string, unknown> | null = null;
  const auth = {
    onAuthStateChange: vi.fn((callback: AuthCallback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: () => { listener = null; } } } };
    }),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: null as unknown })),
    signUp: vi.fn(async () => ({ data: { session: null }, error: null as unknown })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
    updateUser: vi.fn(async () => ({ data: {}, error: null as unknown })),
  };
  const client = {
    auth,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      insert: async (values: Record<string, unknown>) => { row = values; return { error: null }; },
      upsert: async (values: Record<string, unknown>) => { row = values; return { error: null }; },
      update: (values: Record<string, unknown>) => {
        const chain = {
          eq: () => chain,
          select: async () => { row = { ...row, ...values }; return { data: [{}], error: null }; },
        };
        return chain;
      },
    }),
  };
  return {
    client,
    auth,
    /** Fire an auth event as Supabase would. */
    emit(event: string, session: unknown) {
      listener?.(event, session);
    },
  };
}

export const signedIn = (id = 'user-1', email = 'me@example.com') => ({ user: { id, email } });
