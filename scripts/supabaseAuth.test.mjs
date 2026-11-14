import { describe, it, expect, vi } from 'vitest';
import { missingCredentials, saveToken, signIn } from './supabaseAuth.mjs';

const URLS = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' };

/** In-memory stand-in for node:fs, holding just the token file. */
function memoryFs(initial) {
  const files = new Map(initial === undefined ? [] : [['tok', initial]]);
  return {
    files,
    readFileSync: vi.fn(file => {
      if (!files.has(file)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(file);
    }),
    writeFileSync: vi.fn((file, text) => files.set(file, text)),
    chmodSync: vi.fn(),
  };
}

/** Fake supabase client: `valid` lists refresh tokens the server accepts; each use rotates it. */
function fakeSupabase({ valid = [], password = 'pw' } = {}) {
  let n = 0;
  return {
    auth: {
      refreshSession: vi.fn(async ({ refresh_token }) => valid.includes(refresh_token)
        ? { data: { session: { refresh_token: `rotated-${++n}`, user: { id: 'u1' } } }, error: null }
        : { data: { session: null }, error: { message: 'Invalid Refresh Token' } }),
      signInWithPassword: vi.fn(async creds => creds.password === password
        ? { data: { user: { id: 'u1' } }, error: null }
        : { data: { user: null }, error: { message: 'Invalid login credentials' } }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

const opts = (fs, warn = vi.fn()) => ({ tokenFile: 'tok', fs, warn });

describe('missingCredentials', () => {
  it('accepts a refresh token from the env or the token file, or a password', () => {
    expect(missingCredentials({ ...URLS, FLASHCARD_REFRESH_TOKEN: 't' }, 'tok', memoryFs())).toEqual([]);
    expect(missingCredentials(URLS, 'tok', memoryFs('t\n'))).toEqual([]);
    expect(missingCredentials({ ...URLS, FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, 'tok', memoryFs())).toEqual([]);
  });

  it('names what is missing', () => {
    expect(missingCredentials({ FLASHCARD_EMAIL: 'a@b.c' }, 'tok', memoryFs())).toEqual([
      'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'FLASHCARD_REFRESH_TOKEN (or FLASHCARD_EMAIL + FLASHCARD_PASSWORD)',
    ]);
  });
});

describe('signIn', () => {
  it('exchanges FLASHCARD_REFRESH_TOKEN and saves the rotated token, without touching the password', async () => {
    const fs = memoryFs();
    const supabase = fakeSupabase({ valid: ['seed'] });
    const session = await signIn(supabase, { ...URLS, FLASHCARD_REFRESH_TOKEN: 'seed', FLASHCARD_PASSWORD: 'pw', FLASHCARD_EMAIL: 'a@b.c' }, opts(fs));

    expect(session).toMatchObject({ userId: 'u1', method: 'refresh_token' });
    expect(supabase.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'seed' });
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(fs.files.get('tok')).toBe('rotated-1\n');
    expect(fs.writeFileSync).toHaveBeenCalledWith('tok', 'rotated-1\n', { mode: 0o600 });
  });

  it('prefers the saved (newer) token over the env seed, and never signs that session out', async () => {
    const fs = memoryFs('saved\n');
    const supabase = fakeSupabase({ valid: ['saved'] });
    const session = await signIn(supabase, { ...URLS, FLASHCARD_REFRESH_TOKEN: 'old-seed' }, opts(fs));

    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'saved' });
    await session.signOut();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('falls back to the env token when the saved one is rejected', async () => {
    const fs = memoryFs('stale');
    const supabase = fakeSupabase({ valid: ['fresh'] });
    const session = await signIn(supabase, { ...URLS, FLASHCARD_REFRESH_TOKEN: 'fresh' }, opts(fs));
    expect(session.method).toBe('refresh_token');
    expect(fs.files.get('tok')).toBe('rotated-1\n');
  });

  it('falls back to the password when every token is rejected, and signs out only locally', async () => {
    const warn = vi.fn();
    const supabase = fakeSupabase();
    const session = await signIn(supabase, { ...URLS, FLASHCARD_REFRESH_TOKEN: 'revoked', FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, opts(memoryFs(), warn));

    expect(session).toMatchObject({ userId: 'u1', method: 'password' });
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid Refresh Token'));
    await session.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('uses the password alone when there is no token, as before', async () => {
    const supabase = fakeSupabase();
    const session = await signIn(supabase, { ...URLS, FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, opts(memoryFs()));
    expect(session.method).toBe('password');
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('reports a rejected token with no password, a wrong password, and no credentials at all', async () => {
    await expect(signIn(fakeSupabase(), { ...URLS, FLASHCARD_REFRESH_TOKEN: 'revoked' }, opts(memoryFs())))
      .rejects.toThrow(/refresh token rejected.*auth:login/);
    await expect(signIn(fakeSupabase(), { ...URLS, FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'nope' }, opts(memoryFs())))
      .rejects.toThrow('Sign-in failed: Invalid login credentials');
    await expect(signIn(fakeSupabase(), URLS, opts(memoryFs()))).rejects.toThrow(/No credentials/);
  });

  it('still signs in, with a warning, if the rotated token cannot be saved', async () => {
    const fs = memoryFs();
    fs.writeFileSync.mockImplementation(() => { throw new Error('EACCES'); });
    const warn = vi.fn();
    const session = await signIn(fakeSupabase({ valid: ['seed'] }), { ...URLS, FLASHCARD_REFRESH_TOKEN: 'seed' }, opts(fs, warn));
    expect(session.method).toBe('refresh_token');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
  });
});

describe('saveToken', () => {
  it('writes the token with owner-only permissions', () => {
    const fs = memoryFs();
    saveToken('tok', 'abc', fs);
    expect(fs.files.get('tok')).toBe('abc\n');
    expect(fs.chmodSync).toHaveBeenCalledWith('tok', 0o600);
  });

  it('ignores a chmod failure', () => {
    const fs = memoryFs();
    fs.chmodSync.mockImplementation(() => { throw new Error('EPERM'); });
    expect(() => saveToken('tok', 'abc', fs)).not.toThrow();
  });
});
