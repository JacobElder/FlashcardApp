---
description: Write definitions for vocabulary words captured in the app and add them to the study deck
allowed-tools: Bash(npm run words:pending), Bash(npm run words:apply:*), Write
---

Resolve the vocabulary words I captured in the FlashcardApp that are still waiting for definitions.

1. Run `npm run words:pending`. It prints a JSON array of `{ id, word, status, addedAt }`. If it's empty, say there's nothing pending and stop. `status: "not_found"` means the free dictionary had no entry, so these words most need you; `"queued"` ones may still be picked up by the app, but define them too.
2. For each word, write a card in the style of `src/data/vocabularyCards.ts`:
   - `definition`: one concise sentence giving the sense an educated adult most likely met in reading. If the word has several common senses, give the most likely one first and add the second after a semicolon.
   - `partOfSpeech`: lowercase (`noun`, `verb`, `adjective`, ...); omit for phrases.
   - `example`: one natural sentence using the word.
   - `word`: include only to fix an obvious misspelling or capitalization (e.g. `"pyrrhic"` → `"Pyrrhic victory"` only if clearly meant). If you can't tell what word was meant, skip it and tell me instead of guessing.
3. Write the array (`[{ id, definition, partOfSpeech?, example?, word? }]`) to a JSON file in your scratchpad directory and run `npm run words:apply -- <that file>`.
4. Report a short table of the words added with their definitions, plus anything skipped or still pending. Mention that the app picks up the new cards the next time it syncs (on open, or on returning to the tab).
