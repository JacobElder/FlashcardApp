import { describe, it, expect } from 'vitest';
import { MAX_ABILITY_HISTORY, mergeCounts, mergeProfiles, mergeStats, mergeVocabulary } from './merge';
import type { IRTProfile, VocabularyCard } from '../types';

const entry = (cardId: string, lastAnsweredDate: string, leitnerBox: number) => ({
  cardId, timesAnswered: 1, timesCorrect: 1, lastAnsweredDate, leitnerBox,
});

const word = (id: string, definition = 'def'): VocabularyCard => ({
  id, type: 'vocabulary', word: id, definition, front: id, back: definition,
});

describe('mergeProfiles', () => {
  it('returns the other side when one is empty', () => {
    const local: IRTProfile = { ability: 1, cardHistory: { a: entry('a', '2026-01-01', 1) } };
    expect(mergeProfiles(local, {} as IRTProfile)).toBe(local);
    expect(mergeProfiles(undefined, local)).toBe(local);
  });

  it('keeps the most recently answered copy of each card and the union of cards', () => {
    const local: IRTProfile = {
      ability: 0.5,
      updatedAt: '2026-01-03',
      cardHistory: { a: entry('a', '2026-01-03', 3), b: entry('b', '2026-01-01', 1) },
    };
    const remote: IRTProfile = {
      ability: -0.5,
      updatedAt: '2026-01-02',
      cardHistory: { a: entry('a', '2026-01-02', 1), b: entry('b', '2026-01-02', 2), c: entry('c', '2026-01-02', 1) },
    };
    const merged = mergeProfiles(local, remote);
    expect(merged.cardHistory.a.leitnerBox).toBe(3);
    expect(merged.cardHistory.b.leitnerBox).toBe(2);
    expect(merged.cardHistory.c).toBeDefined();
    expect(merged.ability).toBe(0.5); // local was updated more recently
  });

  it('unions, sorts, dedupes and caps ability history', () => {
    const points = (start: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1, 0, 0, start + i)).toISOString(), ability: i }));
    const merged = mergeProfiles(
      { ability: 0, cardHistory: {}, abilityHistory: points(0, 400) },
      { ability: 0, cardHistory: {}, abilityHistory: points(200, 400) }
    );
    expect(merged.abilityHistory).toHaveLength(MAX_ABILITY_HISTORY);
    const dates = merged.abilityHistory!.map(p => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('mergeVocabulary', () => {
  it('unions words and honours deletions from either side', () => {
    const merged = mergeVocabulary(
      { words: [word('a'), word('b')], deletedIds: [], lastUpdated: '2026-01-01' },
      { words: [word('a'), word('c')], deletedIds: ['b'], lastUpdated: '2026-01-02' }
    );
    expect(merged.words.map(w => w.id).sort()).toEqual(['a', 'c']);
    expect(merged.deletedIds).toEqual(['b']);
  });

  it('prefers the more recently edited copy of a word', () => {
    const merged = mergeVocabulary(
      { words: [word('a', 'old')], lastUpdated: '2026-01-01' },
      { words: [word('a', 'new')], lastUpdated: '2026-01-02' }
    );
    expect(merged.words[0].definition).toBe('new');
  });
});

describe('mergeCounts', () => {
  it('takes the max per card', () => {
    expect(mergeCounts({ a: 2, b: 1 }, { a: 1, c: 3 })).toEqual({ a: 2, b: 1, c: 3 });
  });
});

describe('mergeStats', () => {
  it('keeps the latest streak and the larger totals', () => {
    const merged = mergeStats(
      { totalCardsReviewed: 10, totalCorrect: 8, totalIncorrect: 2, lastStudyDate: '2026-01-05', streak: 3 },
      { totalCardsReviewed: 12, totalCorrect: 7, totalIncorrect: 5, lastStudyDate: '2026-01-04', streak: 2 }
    );
    expect(merged).toEqual({ totalCardsReviewed: 12, totalCorrect: 8, totalIncorrect: 5, lastStudyDate: '2026-01-05', streak: 3 });
  });
});
