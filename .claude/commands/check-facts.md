---
description: Research answers for facts added in the app and fact-check the user's own answers
allowed-tools: Bash(npm run facts:pending), Bash(npm run facts:apply:*), Write, WebSearch, WebFetch
---

Resolve the facts I added in the FlashcardApp's Trivia and Data Sci tabs.

1. Run `npm run facts:pending`. It prints a JSON array of `{ id, deck, category, question, answer?, status }`. If it's empty, say there's nothing waiting and stop.
   - `status: "needs_answer"`: I only wrote a question. Research the answer.
   - `status: "needs_check"`: I wrote my own answer. Fact-check it.
2. For each fact, look it up. Use WebSearch for anything you aren't certain of, and prefer reliable sources (encyclopedias, official pages, textbooks, papers). Then write a result:
   - needs_answer: `{ "id", "status": "verified", "answer": "<concise flashcard answer>", "note": "<one line of context and the source>" }`
   - needs_check and correct: `{ "id", "status": "verified", "note"?: "<optional context or source>" }`
   - needs_check and wrong or misleading: `{ "id", "status": "corrected", "answer": "<the right answer>", "note": "<why mine was wrong, plus the source>" }`. Treat an answer that's right but imprecise as verified, and say what to tighten in the note.
   - Keep answers short enough to fit on a flashcard. For Data Science facts, a crisp definition or formula plus one line of intuition beats a paragraph.
   - If a question is too ambiguous to answer, leave it out and ask me what I meant.
3. Write the array to a JSON file in your scratchpad directory and run `npm run facts:apply -- <that file>`.
4. Report a short table: question, answer, and verdict (answered / verified / corrected), with a note on each correction. Mention that the app picks up the changes the next time it syncs (on open, or on returning to the tab).

If the command fails with a missing `user_facts` column, tell me to run `supabase_schema.sql` in the Supabase SQL editor.
