// Read and resolve captured vocabulary words waiting for definitions, straight
// from your Supabase row. Used by the /define-pending Claude Code command.
//
//   npm run words:pending                  list pending words as JSON
//   npm run words:apply -- <defs.json>     turn pending words into cards
//
// defs.json: [{ "id": "...", "definition": "...", "partOfSpeech"?: "...",
//               "example"?: "...", "word"?: "corrected spelling" }]
//
// Signs in as you (RLS only exposes your own row). Needs, in .env.local:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and either a refresh token
//   (preferred: run `npm run auth:login` once) or FLASHCARD_EMAIL + FLASHCARD_PASSWORD.
//   See scripts/supabaseAuth.mjs.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { applyDefinitions } from './applyDefinitions.mjs';

import { CLI_AUTH_OPTIONS, missingCredentials, signIn } from './supabaseAuth.mjs';

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const missing = missingCredentials(process.env);
if (missing.length > 0) fail(`Missing ${missing.join(', ')} in .env.local`);

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, CLI_AUTH_OPTIONS);
let session;
try {
  session = await signIn(supabase, process.env);
} catch (error) {
  fail(error.message);
}
const { userId } = session;

async function readRow() {
  const { data, error } = await supabase
    .from('user_progress')
    .select('user_vocabulary, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(`Read failed: ${error.message}`);
  if (!data) fail('No synced data for this account yet; open the app once while signed in.');
  return { vocab: data.user_vocabulary ?? {}, updatedAt: data.updated_at };
}

const [command, file] = process.argv.slice(2);

if (command === 'list') {
  const { vocab } = await readRow();
  const pending = (vocab.pending ?? []).map(({ id, word, status, addedAt }) => ({ id, word, status, addedAt }));
  console.log(JSON.stringify(pending, null, 2));
} else if (command === 'apply') {
  if (!file) fail('Usage: npm run words:apply -- <defs.json>');
  const defs = JSON.parse(readFileSync(file, 'utf8'));

  // Write only if the row is unchanged since we read it (the app may sync in
  // between); otherwise re-read and apply again, so nothing is overwritten.
  let report;
  for (let attempt = 0; ; attempt++) {
    if (attempt === 3) fail('Write failed: the row kept changing. Try again.');
    const { vocab, updatedAt } = await readRow();
    let result;
    try {
      result = applyDefinitions(vocab, defs);
    } catch (error) {
      fail(error.message);
    }
    report = result.report;
    if (!result.vocabulary) break;
    const { data, error } = await supabase
      .from('user_progress')
      .update({ user_vocabulary: result.vocabulary, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('updated_at', updatedAt)
      .select('user_id');
    if (error) fail(`Write failed: ${error.message}`);
    if (data && data.length > 0) break;
  }
  console.log(JSON.stringify(report, null, 2));
} else {
  fail('Usage: pending-words.mjs list | apply <defs.json>');
}

await session.signOut();
