# FlashcardApp (Adaptive Learning Ecosystem)

An advanced, automated "Adaptive Learning Ecosystem" that transforms a static flashcard/trivia application into an NLP-driven pipeline backed by an **Item Response Theory (IRT)** adaptive testing engine.

## Key Features

- **Item Response Theory (IRT) Engine**: A 2PL model for open recall and 3PL (with a guessing floor) for multiple choice. Ability (θ) is updated by Fisher scoring with a step that shrinks as evidence accumulates, card difficulties are calibrated from your answers (Elo-style), and the next card maximizes Fisher information among cards that are due.
- **Spaced repetition**: Leitner boxes (0, 1, 3, 7, 14, 30 days). Sessions are 20 cards drawn from due and new cards; "Hard" counts as correct without lengthening the interval.
- **Cloud sync**: Supabase auth with per-card merging, so studying on two devices (or offline) never discards answers. Local changes are pushed in batches.
- **Python Content Pipeline**: An automated Python CLI script that ingests Wikipedia URLs (or any text), extracts facts, and uses OpenAI to generate high-quality trivia questions. It employs `sentence-transformers` to generate mathematically "Semantic Distractors" based on cosine similarity, formatting output directly into the React app's JSON schema.
- **React Frontend**: A clean, responsive user interface built with React, Vite, and Tailwind CSS. Features distinct tabs for Trivia and Vocabulary study, dynamic mastery progress bars, and IRT-informed difficulty badges.

## Prerequisites

- Node.js (v18+)
- Python 3.9+ (if running the content pipeline)
- OpenAI API Key (if generating new trivia from URLs)

## Getting Started

### 1. Web Application

To run the React application locally:

```bash
# Install dependencies
npm install

# Supabase credentials (from your project's API settings)
cat > .env.local <<'ENV'
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
ENV

# Start the development server
npm run dev

# Checks (also run in CI)
npm run lint
npm run typecheck
npm run test:run

# Build for production (served from /FlashcardApp/ on GitHub Pages)
npm run build
```

**Supabase setup:** run `supabase_schema.sql` in the Supabase SQL editor (it is safe to re-run and upgrades older schemas). For password-reset and sign-up emails, add `https://jacobelder.github.io/FlashcardApp/` and `http://localhost:5173/` to Authentication → URL Configuration → Redirect URLs.

**Deploying:** pushes to `main` deploy to GitHub Pages. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets (Settings → Secrets and variables → Actions); the build fails with a clear error if they are missing.

### 2. Generating Trivia (Python Pipeline)

If you want to use the automated NLP-pipeline to ingest URLs and generate new Trivia cards:

```bash
cd scripts

# Install Python dependencies
pip install -r requirements.txt

# Export your OpenAI API key
export OPENAI_API_KEY="your-openai-api-key"

# Run the generator against a URL
python generate_trivia.py https://en.wikipedia.org/wiki/New_York_City
```
The script appends the generated card to `src/data/triviaCards.ts`. Categories are limited to the ten core categories; `npm run test:run` checks the deck for duplicates, invalid categories, and bad multiple-choice options.

## Architecture Highlights

- **`src/lib/irt.ts`**: IRT math (probability, information, ability and difficulty updates) and card selection.
- **`src/hooks/useAdaptiveTesting.ts`**: Study-session hook: due queue, Leitner scheduling, ratings, session stats.
- **`src/lib/storage.ts`**: localStorage access with change notifications (`useStorageValue` subscribes to it).
- **`src/lib/sync.ts` / `src/lib/merge.ts`**: Supabase sync and the per-card merge rules.
- **`scripts/generate_trivia.py`**: The NLP data ingestion pipeline.

## License

ISC License
