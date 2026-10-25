# TODO

- [ ] **Enable `/define-pending`**: add your app login to `.env.local` (gitignored) so `scripts/pending-words.mjs` can sign in:
  ```
  FLASHCARD_EMAIL=you@example.com
  FLASHCARD_PASSWORD=your-app-password
  ```
  Then run `npm run words:pending` to check it works.
- [x] **Merge before pushing in cloud sync**: every sync now downloads and merges first, and only writes if the cloud row is unchanged since (compare-and-swap on `updated_at`), so an open app can't overwrite `/define-pending` results or another device.
- [x] **Trouble cards graduate**: a card leaves the Trouble drill after 3 correct answers in a row (`correctStreak` in its history, which syncs newest-wins; the miss count itself only grows, since sync keeps the larger count).
- [ ] **Claude-written definitions (deferred)**: Supabase Edge Function that calls the Claude API when the free dictionary has no entry (or always), with an optional "where I saw it" field to pick the right sense. Needs an Anthropic API key as a Supabase secret.
