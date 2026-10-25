import { describe, it, expect } from 'vitest';
import { applyFacts } from './applyFacts.mjs';

const NOW = '2026-02-01T00:00:00.000Z';
const fact = (id, status, answer) => ({
  id, deck: 'trivia', category: 'History', question: `q-${id}`, ...(answer ? { answer } : {}),
  status, addedAt: '2026-01-01', updatedAt: '2026-01-01',
});
const facts = () => ({
  facts: [fact('a', 'needs_answer'), fact('b', 'needs_check', '1215'), fact('c', 'needs_check', '1066'), fact('d', 'verified', 'x')],
  deletedIds: ['gone'],
  lastUpdated: '2026-01-01',
});

describe('applyFacts', () => {
  it('answers, verifies and corrects facts, keeping the user\'s wrong answer', () => {
    const { facts: out, report } = applyFacts(facts(), [
      { id: 'a', status: 'verified', answer: ' Augustus ', note: 'First emperor, 27 BC.' },
      { id: 'b', status: 'verified' },
      { id: 'c', status: 'corrected', answer: '1215', note: 'Magna Carta was 1215; 1066 is Hastings.' },
    ], NOW);

    expect(out.facts.find(f => f.id === 'a')).toMatchObject({ answer: 'Augustus', status: 'verified', note: 'First emperor, 27 BC.', updatedAt: NOW });
    expect(out.facts.find(f => f.id === 'b')).toMatchObject({ answer: '1215', status: 'verified', updatedAt: NOW });
    expect(out.facts.find(f => f.id === 'c')).toMatchObject({ answer: '1215', originalAnswer: '1066', status: 'corrected' });
    expect(out.facts.find(f => f.id === 'd').updatedAt).toBe('2026-01-01');
    expect(out.deletedIds).toEqual(['gone']);
    expect(out.lastUpdated).toBe(NOW);
    expect(report).toEqual({ verified: ['q-b'], corrected: ['q-c'], answered: ['q-a'], skipped: [], stillOpen: [] });
  });

  it('skips unknown or closed ids, bad statuses, missing answers and repeats', () => {
    const { facts: out, report } = applyFacts(facts(), [
      { id: 'nope', status: 'verified' },
      { id: 'd', status: 'verified' },
      { id: 'a', status: 'verified' },
      { id: 'b', status: 'maybe' },
      { id: 'c', status: 'corrected', answer: '  ' },
      { id: 'b', status: 'verified' },
      { id: 'b', status: 'verified' },
    ], NOW);
    expect(report.skipped).toEqual(['nope', 'd', 'q-a', 'q-b', 'q-c', 'b']);
    expect(report.stillOpen).toEqual(['q-a', 'q-c']);
    expect(out.facts.find(f => f.id === 'b').status).toBe('verified');
  });

  it('returns null when nothing changes and rejects a non-array', () => {
    expect(applyFacts(facts(), [], NOW).facts).toBeNull();
    expect(() => applyFacts(facts(), {})).toThrow('must be an array');
  });
});
