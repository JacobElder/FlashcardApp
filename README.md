# FlashcardApp (Adaptive Learning Ecosystem)

An advanced, automated "Adaptive Learning Ecosystem" that transforms a static flashcard/trivia application into an NLP-driven pipeline backed by an **Item Response Theory (IRT)** adaptive testing engine.

## Key Features

- **Item Response Theory (IRT) Engine**: Swapped out traditional heuristics-based spaced repetition (e.g., SM-2) with a statistically robust 2PL IRT model. The application calculates your exact knowledge Ability (θ) using Maximum Likelihood Estimation (MLE) and selects questions that maximize Fisher Information.
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

# Start the development server
npm run dev

# Build for production
npm run build
```

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
The script will automatically append the generated cards into `src/data/triviaCards.ts` with dynamically assigned IRT parameters.

## Architecture Highlights

- **`src/lib/irt.ts`**: Contains the mathematical foundations for the 2PL IRT engine (Probability calculation, Information calculation, Ability updating).
- **`src/hooks/useAdaptiveTesting.ts`**: React hook that interfaces with the IRT engine, tracking user profiles and history in local storage.
- **`scripts/generate_trivia.py`**: The NLP data ingestion pipeline.

## License

ISC License
