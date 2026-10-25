// Pure logic for `npm run facts:apply`, kept separate so it can be unit tested.

const STATUSES = new Set(['verified', 'corrected']);

/**
 * Fill in or fact-check facts the user added in the app.
 * `results` entries: { id, status: 'verified' | 'corrected', answer?, note? }.
 * - A fact waiting for an answer needs `answer` (status 'verified' means Claude researched it).
 * - A fact with the user's answer: 'verified' keeps it; 'corrected' replaces it with `answer`
 *   and keeps the user's version as `originalAnswer`.
 * Unknown ids, bad statuses, missing answers and repeated ids are skipped.
 * Returns the updated facts (null if nothing changed) and a report.
 */
export function applyFacts(userFacts, results, now = new Date().toISOString()) {
  if (!Array.isArray(results)) throw new Error('results file must be an array');
  const facts = Array.isArray(userFacts?.facts) ? userFacts.facts : [];
  const open = new Map(
    facts.filter(f => f.status === 'needs_answer' || f.status === 'needs_check').map(f => [f.id, f])
  );
  const updated = new Map();
  const report = { verified: [], corrected: [], answered: [], skipped: [] };

  for (const result of results) {
    const fact = result && open.get(result.id);
    const answer = typeof result?.answer === 'string' ? result.answer.trim() : '';
    const note = typeof result?.note === 'string' && result.note.trim() ? result.note.trim() : undefined;
    const needsNewAnswer = fact && (fact.status === 'needs_answer' || result.status === 'corrected');
    if (!fact || !STATUSES.has(result.status) || (needsNewAnswer && !answer)) {
      report.skipped.push(fact?.question ?? result?.id ?? '(missing id)');
      continue;
    }
    open.delete(fact.id); // a repeated id is now unknown, so it's skipped
    if (fact.status === 'needs_answer') {
      updated.set(fact.id, { ...fact, answer, status: 'verified', ...(note ? { note } : {}), updatedAt: now });
      report.answered.push(fact.question);
    } else if (result.status === 'corrected') {
      updated.set(fact.id, {
        ...fact, answer, originalAnswer: fact.answer, status: 'corrected', ...(note ? { note } : {}), updatedAt: now,
      });
      report.corrected.push(fact.question);
    } else {
      updated.set(fact.id, { ...fact, status: 'verified', ...(note ? { note } : {}), updatedAt: now });
      report.verified.push(fact.question);
    }
  }

  report.stillOpen = [...open.values()].map(f => f.question);
  if (updated.size === 0) return { facts: null, report };
  return {
    facts: { ...userFacts, facts: facts.map(f => updated.get(f.id) ?? f), lastUpdated: now },
    report,
  };
}
