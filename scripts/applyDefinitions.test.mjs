import { describe, it, expect } from 'vitest';
import { applyDefinitions } from './applyDefinitions.mjs';

const vocab = () => ({
  words: [{ id: 'w1', word: 'old' }],
  pending: [
    { id: 'p1', word: 'laconic', status: 'queued' },
    { id: 'p2', word: 'teh', status: 'not_found' },
    { id: 'p3', word: 'sere', status: 'queued' },
  ],
  deletedIds: ['x'],
  lastUpdated: '2026-01-01',
});
const NOW = '2026-02-01T00:00:00.000Z';

describe('applyDefinitions', () => {
  it('turns defined pending words into cards with the same id and keeps the rest pending', () => {
    const { vocabulary, report } = applyDefinitions(vocab(), [
      { id: 'p1', definition: ' Using few words. ', partOfSpeech: 'adjective', example: 'A laconic reply.' },
      { id: 'p2', definition: 'the', word: 'the' },
    ], NOW);

    expect(vocabulary.words.map(w => w.id)).toEqual(['w1', 'p1', 'p2']);
    expect(vocabulary.words[1]).toEqual({
      id: 'p1', type: 'vocabulary', isUserAdded: true, word: 'laconic', definition: 'Using few words.',
      partOfSpeech: 'adjective', example: 'A laconic reply.', front: 'laconic',
      back: 'Using few words.\n\nExample: "A laconic reply."', updatedAt: NOW,
    });
    expect(vocabulary.words[2].word).toBe('the'); // spelling correction
    expect(vocabulary.pending.map(p => p.id)).toEqual(['p3']);
    expect(vocabulary.deletedIds).toEqual(['x']);
    expect(vocabulary.lastUpdated).toBe(NOW);
    expect(report).toEqual({ applied: ['laconic', 'the'], skipped: [], stillPending: ['sere'] });
  });

  it('skips unknown ids, blank definitions and repeated ids', () => {
    const { vocabulary, report } = applyDefinitions(vocab(), [
      { id: 'nope', definition: 'd' },
      { id: 'p1', definition: '   ' },
      { id: 'p3', definition: 'dry' },
      { id: 'p3', definition: 'again' },
      null,
    ], NOW);
    expect(vocabulary.words.filter(w => w.id === 'p3')).toHaveLength(1);
    expect(vocabulary.words.find(w => w.id === 'p3').definition).toBe('dry');
    expect(report.skipped).toEqual(['nope', 'laconic', 'p3', '(missing id)']);
  });

  it('returns no vocabulary when nothing applies, so nothing is written', () => {
    expect(applyDefinitions(vocab(), [{ id: 'nope', definition: 'd' }], NOW).vocabulary).toBeNull();
  });

  it('copes with a row that has no words or pending yet', () => {
    expect(applyDefinitions({}, [{ id: 'p1', definition: 'd' }], NOW).vocabulary).toBeNull();
  });

  it('rejects a defs file that is not an array', () => {
    expect(() => applyDefinitions(vocab(), { id: 'p1' }, NOW)).toThrow('must be an array');
  });
});
