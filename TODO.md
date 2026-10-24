# TODO

- [ ] **Enable `/define-pending`**: add your app login to `.env.local` (gitignored) so `scripts/pending-words.mjs` can sign in:
  ```
  FLASHCARD_EMAIL=you@example.com
  FLASHCARD_PASSWORD=your-app-password
  ```
  Then run `npm run words:pending` to check it works.
- [x] **Merge before pushing in cloud sync**: every sync now downloads and merges first, and only writes if the cloud row is unchanged since (compare-and-swap on `updated_at`), so an open app can't overwrite `/define-pending` results or another device.
- [ ] **Trouble cards never graduate** (design decision): `incorrectCounts` only goes up, so a card missed twice stays in the Trouble drill forever. Consider decrementing on a correct answer, or clearing after N correct in a row.
- [ ] **Claude-written definitions (deferred)**: Supabase Edge Function that calls the Claude API when the free dictionary has no entry (or always), with an optional "where I saw it" field to pick the right sense. Needs an Anthropic API key as a Supabase secret.
