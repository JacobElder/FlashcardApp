// Sign the CLI scripts (pending-words, pending-facts) in to Supabase.
//
// Preferred: a refresh token, so no password sits in .env.local. Supabase
// rotates refresh tokens on every use, so the new one is saved to
// TOKEN_FILE (gitignored) straight away and read from there next time.
// FLASHCARD_REFRESH_TOKEN in .env.local seeds it the first time.
//
// Fallback: FLASHCARD_EMAIL + FLASHCARD_PASSWORD, as before.
//
//   npm run auth:login             sign in once (password prompted, not stored)
//                                  and save a refresh token for the CLI
//   npm run auth:login -- --print  print a token for a separate session instead
//                                  (for the Word Genius Apps Script)
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const TOKEN_FILE = '.flashcard-refresh-token';

/** createClient options for a short-lived CLI client: nothing in storage, and no
 *  background refresh that would rotate the token after it has been saved. */
export const CLI_AUTH_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } };

function readToken(file, fs) {
  try {
    return fs.readFileSync(file, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function saveToken(file, token, fs = { writeFileSync, chmodSync }) {
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort (e.g. on filesystems without POSIX modes)
  }
}

/** Which credentials are missing, or [] if the scripts can sign in. */
export function missingCredentials(env, tokenFile = TOKEN_FILE, fs = { readFileSync }) {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(name => !env[name]);
  const hasToken = Boolean(env.FLASHCARD_REFRESH_TOKEN || readToken(tokenFile, fs));
  if (!hasToken && !(env.FLASHCARD_EMAIL && env.FLASHCARD_PASSWORD)) {
    missing.push('FLASHCARD_REFRESH_TOKEN (or FLASHCARD_EMAIL + FLASHCARD_PASSWORD)');
  }
  return missing;
}

/**
 * Sign `supabase` in. Tries the saved token file, then FLASHCARD_REFRESH_TOKEN,
 * then the password. Returns { userId, method, signOut } or throws.
 * `signOut` ends a password session; for a refresh-token session it does
 * nothing, since signing out would revoke the token that was just saved.
 */
export async function signIn(supabase, env, { tokenFile = TOKEN_FILE, fs = { readFileSync, writeFileSync, chmodSync }, warn = console.error } = {}) {
  const candidates = [...new Set([readToken(tokenFile, fs), env.FLASHCARD_REFRESH_TOKEN].filter(Boolean))];
  const failures = [];
  for (const refreshToken of candidates) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) {
      failures.push(error?.message ?? 'no session returned');
      continue;
    }
    try {
      saveToken(tokenFile, data.session.refresh_token, fs);
    } catch (saveError) {
      // The old token is now spent; without the new one the next run must use the password
      warn(`Warning: couldn't save the rotated refresh token to ${tokenFile} (${saveError.message}). Run npm run auth:login again.`);
    }
    return { userId: data.session.user.id, method: 'refresh_token', signOut: async () => {} };
  }

  if (env.FLASHCARD_EMAIL && env.FLASHCARD_PASSWORD) {
    if (failures.length > 0) warn(`Refresh token rejected (${failures.join('; ')}); signing in with the password instead.`);
    const { data, error } = await supabase.auth.signInWithPassword({ email: env.FLASHCARD_EMAIL, password: env.FLASHCARD_PASSWORD });
    if (error) throw new Error(`Sign-in failed: ${error.message}`);
    // 'local' ends only this session; the default ('global') would sign you out of the app everywhere
    return { userId: data.user.id, method: 'password', signOut: () => supabase.auth.signOut({ scope: 'local' }) };
  }

  if (failures.length > 0) throw new Error(`Sign-in failed: refresh token rejected (${failures.join('; ')}). Run npm run auth:login to get a new one.`);
  throw new Error('No credentials: run npm run auth:login, or set FLASHCARD_EMAIL and FLASHCARD_PASSWORD in .env.local.');
}

/** Prompt on the terminal; `hidden` stops the answer echoing (for passwords). */
async function prompt(question, { hidden = false } = {}) {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = text => {
      if (text.includes(question)) process.stdout.write(text);
    };
  }
  const answer = await new Promise(resolve => rl.question(question, resolve));
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer;
}

/** `npm run auth:login`: one password sign-in that creates a new session and keeps only its refresh token. */
async function login(args) {
  const { createClient } = await import('@supabase/supabase-js');
  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, FLASHCARD_EMAIL } = process.env;
  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  const email = FLASHCARD_EMAIL || (await prompt('Email: '));
  const password = await prompt('Password (not saved): ', { hidden: true });
  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, CLI_AUTH_OPTIONS);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  if (args.includes('--print')) {
    console.log(`\nRefresh token for a new session (paste it into the FLASHCARD_REFRESH_TOKEN Script Property; don't reuse it for the CLI):\n\n${data.session.refresh_token}\n`);
  } else {
    saveToken(TOKEN_FILE, data.session.refresh_token);
    console.log(`Saved a refresh token to ${TOKEN_FILE}. You can remove FLASHCARD_PASSWORD from .env.local.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'login') {
    console.error('Usage: supabaseAuth.mjs login [--print]');
    process.exit(1);
  }
  login(args).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
