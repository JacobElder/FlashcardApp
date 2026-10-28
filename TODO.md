# TODO

- [x] **Enable `/define-pending`**: login is in `.env.local` (gitignored); `npm run words:pending` signs in. Quote the password value if it contains `#`, since Node's `--env-file` treats an unquoted `#` as the start of a comment.
- [x] **Merge before pushing in cloud sync**: every sync now downloads and merges first, and only writes if the cloud row is unchanged since (compare-and-swap on `updated_at`), so an open app can't overwrite `/define-pending` results or another device.
- [x] **Trouble cards graduate**: a card leaves the Trouble drill after 3 correct answers in a row (`correctStreak` in its history, which syncs newest-wins; the miss count itself only grows, since sync keeps the larger count).
- [ ] **Claude-written definitions (deferred)**: Supabase Edge Function that calls the Claude API when the free dictionary has no entry (or always), with an optional "where I saw it" field to pick the right sense. Needs an Anthropic API key as a Supabase secret.
- [ ] **Set up the Word Genius daily sync** (one-time, ~5 minutes; full guide in `scripts/word-genius/README.md`):
  1. At <https://script.google.com> (signed in to the Gmail account that gets Word Genius), create a project named "Word Genius sync".
  2. Replace the placeholder code with all of `scripts/word-genius/WordGenius.gs` and save.
  3. In Project Settings → Script Properties, add `SUPABASE_URL`, `SUPABASE_ANON_KEY` (from `.env.local`), `FLASHCARD_EMAIL`, and `FLASHCARD_PASSWORD`.
  4. Run `checkRecentEmails` and approve Google's permission prompt. Check the log: each recent word should show a clean definition. If any are missing or garbled, share the log so `parseWordGeniusEmail` can be fixed (it was tested against a sample built from the email layout, not a real raw email).
  5. Run `syncWordGenius` once, then `installDailyTrigger` once (daily, 9–10 a.m.).
  6. Afterward, confirm new words appear in the app's Vocabulary tab under My Words.
