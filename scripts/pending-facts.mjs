// Read and resolve facts added in the Trivia and Data Science tabs that are
// waiting for an answer or a fact-check, straight from your Supabase row.
// Used by the /check-facts Claude Code command.
//
//   npm run facts:pending                    list open facts as JSON
//   npm run facts:apply -- <results.json>    save answers and fact-checks
//
// results.json: [{ "id": "...", "status": "verified" | "corrected",
//                  "answer"?: "...", "note"?: "source or explanation" }]
//
// Signs in as you (RLS only exposes your own row). Needs, in .env.local:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, FLASHCARD_EMAIL, FLASHCARD_PASSWORD
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { applyFacts } from './applyFacts.mjs';

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, FLASHCARD_EMAIL, FLASHCARD_PASSWORD } = process.env;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const missing = Object.entries({ VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, FLASHCARD_EMAIL, FLASHCARD_PASSWORD })
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) fail(`Missing ${missing.join(', ')} in .env.local`);

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: FLASHCARD_EMAIL,
  password: FLASHCARD_PASSWORD,
});
if (authError) fail(`Sign-in failed: ${authError.message}`);
const userId = auth.user.id;

async function readRow() {
  const { data, error } = await supabase
    .from('user_progress')
    .select('user_facts, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail(`Read failed: ${error.message}${error.code === '42703' ? ' (run supabase_schema.sql to add the user_facts column)' : ''}`);
  if (!data) fail('No synced data for this account yet; open the app once while signed in.');
  return { userFacts: data.user_facts ?? {}, updatedAt: data.updated_at };
}

const [command, file] = process.argv.slice(2);

if (command === 'list') {
  const { userFacts } = await readRow();
  const open = (userFacts.facts ?? [])
    .filter(f => f.status === 'needs_answer' || f.status === 'needs_check')
    .map(({ id, deck, category, question, answer, status }) => ({ id, deck, category, question, answer, status }));
  console.log(JSON.stringify(open, null, 2));
} else if (command === 'apply') {
  if (!file) fail('Usage: npm run facts:apply -- <results.json>');
  const results = JSON.parse(readFileSync(file, 'utf8'));

  // Write only if the row is unchanged since we read it (the app may sync in
  // between); otherwise re-read and apply again, so nothing is overwritten.
  let report;
  for (let attempt = 0; ; attempt++) {
    if (attempt === 3) fail('Write failed: the row kept changing. Try again.');
    const { userFacts, updatedAt } = await readRow();
    let result;
    try {
      result = applyFacts(userFacts, results);
    } catch (error) {
      fail(error.message);
    }
    report = result.report;
    if (!result.facts) break;
    const { data, error } = await supabase
      .from('user_progress')
      .update({ user_facts: result.facts, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('updated_at', updatedAt)
      .select('user_id');
    if (error) fail(`Write failed: ${error.message}`);
    if (data && data.length > 0) break;
  }
  console.log(JSON.stringify(report, null, 2));
} else {
  fail('Usage: pending-facts.mjs list | apply <results.json>');
}

await supabase.auth.signOut();
