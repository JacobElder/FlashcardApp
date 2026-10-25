# TODO

- [x] **Enable `/define-pending`**: login is in `.env.local` (gitignored); `npm run words:pending` signs in. Quote the password value if it contains `#`, since Node's `--env-file` treats an unquoted `#` as the start of a comment.
- [x] **Merge before pushing in cloud sync**: every sync now downloads and merges first, and only writes if the cloud row is unchanged since (compare-and-swap on `updated_at`), so an open app can't overwrite `/define-pending` results or another device.
- [x] **Trouble cards graduate**: a card leaves the Trouble drill after 3 correct answers in a row (`correctStreak` in its history, which syncs newest-wins; the miss count itself only grows, since sync keeps the larger count).
- [ ] **Claude-written definitions (deferred)**: Supabase Edge Function that calls the Claude API when the free dictionary has no entry (or always), with an optional "where I saw it" field to pick the right sense. Needs an Anthropic API key as a Supabase secret.
