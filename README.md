# Study Deck

Adaptive flashcards for pub-quiz trivia, vocabulary, and data science. Card selection uses Item Response Theory, reviews are spaced with Leitner boxes, and progress syncs across devices through Supabase. It installs as a PWA and works offline.

Live at <https://jacobelder.github.io/FlashcardApp/> (GitHub Pages) and on Vercel.

## Features

- **Three decks, one study screen**: **Trivia** (general-knowledge, competitive-league style, with multiple-choice options), **Vocabulary**, and **Data Sci**. All three use the same study UI, with category filters, keyboard shortcuts (Space to flip, 1–4 to rate, S to skip), a skip button, and a "Trouble" drill for cards you keep missing.
- **Analytics** tab: your estimated ability (θ) over time, per deck.
- **Adaptive selection (IRT)**: a 2PL model for open recall and a 3PL model (with a guessing floor) for multiple choice. Ability is updated by Fisher scoring with a step that shrinks as evidence accumulates, card difficulties are calibrated from your answers (Elo-style), and the next card is the one with the most Fisher information among cards that are due.
- **Spaced repetition**: Leitner boxes with intervals of 0, 1, 3, 7, 14 and 30 days. Sessions are 20 cards drawn from due and new cards; "Hard" counts as correct without lengthening the interval.
- **Accounts and cloud sync**: Supabase email/password auth. Sync merges per card and writes with compare-and-swap, so studying on two devices (or offline) never discards answers.
- **PWA / offline**: installable, with a service worker that caches the app. Long-press the home-screen icon for an **Add word** shortcut.
- **Vocabulary capture**: save a word you come across; the app looks it up in the free dictionary and turns it into a card. Words it can't find wait in a queue for the `/define-pending` Claude Code command, which writes definitions and adds them (`npm run words:pending` / `words:apply`).
- **Add a fact**: in the Trivia and Data Sci tabs, add your own question, with or without an answer. The `/check-facts` Claude Code command researches missing answers and fact-checks yours (`npm run facts:pending` / `facts:apply`).
- **Word Genius daily sync**: a Google Apps Script adds each Word Genius "Word of the Day" email to your vocabulary. Setup: [`scripts/word-genius/README.md`](scripts/word-genius/README.md).

## Getting started

Requires Node.js 22 (what CI uses; 20.6+ is needed for `--env-file`).

```bash
npm install

# Supabase project values (Project Settings → API); gitignored
cat > .env.local <<'ENV'
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
ENV

npm run dev            # http://localhost:5173/
```

**Supabase setup:** run `supabase_schema.sql` in the Supabase SQL editor (safe to re-run; it upgrades older schemas). Under Authentication → URL Configuration → Redirect URLs, add every origin the app is served from, so sign-up and password-reset links work: `https://jacobelder.github.io/FlashcardApp/`, your Vercel domain (e.g. `https://<project>.vercel.app/`), and `http://localhost:5173/`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and build to `dist/` (base `/FlashcardApp/`, or `/` on Vercel) |
| `npm run preview` | Serve the build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:run` | Vitest (watch / once); `npm run test:coverage` enforces coverage floors |
| `npm run test:e2e` | Playwright smoke tests against the production build (base path, manifest, offline, a sign-in-and-study flow against a fake Supabase). Run `npx playwright install chromium` once first |
| `npm run auth:login` | Sign in once and save a refresh token for the scripts below |
| `npm run words:pending` / `words:apply` | Used by `/define-pending` |
| `npm run facts:pending` / `facts:apply` | Used by `/check-facts` |

### Credentials for the command-line scripts

`words:*` and `facts:*` sign in as you, since Row Level Security only exposes your own row. Run `npm run auth:login` once: it asks for your password (not stored) and saves a refresh token to `.flashcard-refresh-token` (gitignored, owner-only permissions). Supabase rotates the token on every use, and the scripts save the new one each time. You can also seed it with `FLASHCARD_REFRESH_TOKEN` in `.env.local`. As a fallback, `FLASHCARD_EMAIL` and `FLASHCARD_PASSWORD` in `.env.local` still work; quote the password if it contains `#`.

## Architecture

- **`src/App.tsx`**: tabs, auth gate, sync lifecycle.
- **`src/components/DeckStudy.tsx`**: the shared study screen. `src/pages/TriviaStudy.tsx`, `VocabularyStudy.tsx` and `DataScienceStudy.tsx` configure it per deck; `src/pages/Analytics.tsx` is the Analytics tab.
- **`src/lib/irt.ts`**: IRT math (probability, information, ability and difficulty updates), Leitner intervals, and card selection.
- **`src/hooks/useAdaptiveTesting.ts`**: the study-session hook: due queue, scheduling, ratings, session stats.
- **`src/lib/storage.ts`**: localStorage access with change notifications (`useStorageValue` subscribes to it). Keys keep their original `nyc-*` names so existing progress survives.
- **`src/lib/sync.ts` / `src/lib/merge.ts`**: Supabase sync and the per-card merge rules.
- **`src/lib/pendingWords.ts`, `src/lib/dictionary.ts`, `src/lib/facts.ts`**: vocabulary capture and lookup, and user-added facts.
- **`src/data/`**: the built-in decks (`triviaCards.ts`, `vocabularyCards.ts`, `dataScienceCards.ts`). Unit tests check them for duplicates, invalid categories and bad multiple-choice options.
- **`scripts/`**: the command-line helpers above (`pending-words.mjs`, `pending-facts.mjs`, `supabaseAuth.mjs`) and the Word Genius Apps Script (`word-genius/`).
- **`.claude/commands/`**: the `/define-pending` and `/check-facts` Claude Code commands.

## Deploying

`main` deploys to two places:

- **GitHub Pages** (`.github/workflows/deploy.yml`), served at `/FlashcardApp/`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets (Settings → Secrets and variables → Actions); the build fails with a clear error if they are missing.
- **Vercel**, served from the domain root. Vercel sets `VERCEL=1` during its builds, which switches the Vite base (and the PWA scope and start URL) to `/`. Set the same two `VITE_SUPABASE_*` variables in the Vercel project's environment variables.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests with coverage, the build, and the Playwright tests on every branch and pull request.

## License

ISC
