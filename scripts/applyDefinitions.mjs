// Pure logic for `npm run words:apply`, kept separate so it can be unit tested.

// Mirrors toCardFields in src/lib/storage.ts
export function toCardFields({ word, definition, partOfSpeech, example }) {
  return {
    word,
    definition,
    partOfSpeech,
    example,
    front: word,
    back: definition + (example ? `\n\nExample: "${example}"` : ''),
  };
}

/**
 * Turn pending words into cards using hand-written definitions.
 * `defs` entries: { id, definition, partOfSpeech?, example?, word? (corrected spelling) }.
 * Unknown ids, blank definitions and repeated ids are skipped. Returns the
 * updated vocabulary (null if nothing changed) and a report.
 */
export function applyDefinitions(vocab, defs, now = new Date().toISOString()) {
  if (!Array.isArray(defs)) throw new Error('defs.json must be an array');
  const words = Array.isArray(vocab?.words) ? vocab.words : [];
  const pending = Array.isArray(vocab?.pending) ? vocab.pending : [];
  const pendingById = new Map(pending.map(p => [p.id, p]));
  const applied = [];
  const skipped = [];
  const newWords = [];

  for (const def of defs) {
    const item = def && pendingById.get(def.id);
    const definition = typeof def?.definition === 'string' ? def.definition.trim() : '';
    if (!item || !definition) {
      skipped.push(item?.word ?? def?.id ?? '(missing id)');
      continue;
    }
    const word = (typeof def.word === 'string' && def.word.trim()) || item.word;
    newWords.push({
      id: item.id,
      type: 'vocabulary',
      isUserAdded: true,
      ...toCardFields({
        word,
        definition,
        partOfSpeech: def.partOfSpeech?.trim() || undefined,
        example: def.example?.trim() || undefined,
      }),
      updatedAt: now,
    });
    pendingById.delete(item.id); // a repeated id is now unknown, so it's skipped
    applied.push(word);
  }

  const stillPending = [...pendingById.values()];
  const report = { applied, skipped, stillPending: stillPending.map(p => p.word) };
  if (newWords.length === 0) return { vocabulary: null, report };
  return {
    vocabulary: { ...vocab, words: [...words, ...newWords], pending: stillPending, lastUpdated: now },
    report,
  };
}
