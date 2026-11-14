import { describe, it, expect } from 'vitest';
import {
  MAX_ABILITY_HISTORY,
  carryOverHistory,
  mergeCardHistory,
  mergeCounter,
  mergeCounts,
  mergeProfiles,
  mergeStats,
  mergeVocabulary,
  mergeVocabularyWithAliases,
} from './merge';
import type { IRTProfile, UserVocabulary, VocabularyCard } from '../types';

const entry = (cardId: string, lastAnsweredDate: string, leitnerBox: number) => ({
  cardId, timesAnswered: 1, timesCorrect: 1, lastAnsweredDate, leitnerBox,
});

const word = (id: string, definition = 'def', updatedAt?: string, text = id): VocabularyCard => ({
  id, type: 'vocabulary', word: text, definition, front: text, back: definition, ...(updatedAt ? { updatedAt } : {}),
});

describe('mergeProfiles', () => {
  it('returns the other side when one is empty', () => {
    const local: IRTProfile = { ability: 1, cardHistory: { a: entry('a', '2026-01-01', 1) } };
    expect(mergeProfiles(local, {} as IRTProfile)).toEqual(local);
    expect(mergeProfiles(undefined, local)).toEqual(local);
    expect(mergeProfiles(undefined, undefined)).toEqual({ ability: 0, cardHistory: {} });
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
    // Neither has abilityInfo; remote answered more cards, so it carries more evidence
    expect(merged.ability).toBe(-0.5);
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

describe('mergeProfiles edge cases', () => {
  it('takes ability from the copy with more accumulated evidence', () => {
    const merged = mergeProfiles(
      { ability: 1.5, abilityInfo: 30, cardHistory: {}, updatedAt: '2026-01-01' },
      { ability: 0.2, abilityInfo: 2, cardHistory: {}, updatedAt: '2026-01-05' }
    );
    expect(merged).toMatchObject({ ability: 1.5, abilityInfo: 30, updatedAt: '2026-01-05' });
  });

  it('breaks a lastAnsweredDate tie in favour of the local copy', () => {
    const merged = mergeProfiles(
      { ability: 0, cardHistory: { a: entry('a', '2026-01-01', 3) } },
      { ability: 0, cardHistory: { a: entry('a', '2026-01-01', 1) } }
    );
    expect(merged.cardHistory.a.leitnerBox).toBe(3);
  });

  it('takes ability from whichever side has the latest activity', () => {
    const merged = mergeProfiles(
      { ability: 1, cardHistory: { a: entry('a', '2026-01-01', 1) }, abilityHistory: [{ date: '2026-01-01', ability: 1 }] },
      { ability: -1, cardHistory: { b: entry('b', '2026-01-02', 1) }, abilityHistory: [{ date: '2026-01-02', ability: -1 }] }
    );
    expect(merged.ability).toBe(-1);
  });

  it('repairs a partial or corrupt remote profile instead of crashing', () => {
    const remote = { ability: NaN, cardHistory: 'nope', abilityHistory: [{ date: 5 }, { date: '2026-01-01', ability: 0.3 }] };
    const merged = mergeProfiles({ ability: 0.5, cardHistory: { a: entry('a', '2026-01-01', 1) } }, remote as unknown as IRTProfile);
    expect(Object.keys(merged.cardHistory)).toEqual(['a']);
    expect(Number.isFinite(merged.ability)).toBe(true);
    expect(merged.abilityHistory).toEqual([{ date: '2026-01-01', ability: 0.3 }]);
  });

  it('is idempotent: merging a profile with itself changes nothing', () => {
    const p: IRTProfile = { ability: 0.2, cardHistory: { a: entry('a', '2026-01-01', 2) }, updatedAt: '2026-01-01' };
    expect(JSON.stringify(mergeProfiles(p, p))).toBe(JSON.stringify(p));
  });
});

describe('mergeVocabulary', () => {
  it('keeps each word\'s own latest edit when two devices edited different words', () => {
    const base = '2026-01-01T00:00:00Z';
    // Device 1 edited x at 10:00; device 2 edited y at 11:00 (so its list is newer)
    const device1 = { words: [word('x', 'x edited', '2026-01-01T10:00:00Z'), word('y', 'y orig', base)], lastUpdated: '2026-01-01T10:00:00Z' };
    const device2 = { words: [word('x', 'x orig', base), word('y', 'y edited', '2026-01-01T11:00:00Z')], lastUpdated: '2026-01-01T11:00:00Z' };
    for (const merged of [mergeVocabulary(device1, device2), mergeVocabulary(device2, device1)]) {
      const byId = Object.fromEntries(merged.words.map(w => [w.id, w.definition]));
      expect(byId).toEqual({ x: 'x edited', y: 'y edited' });
    }
  });

  it('falls back to the list edit time for words saved without one', () => {
    const merged = mergeVocabulary(
      { words: [word('a', 'local')], lastUpdated: '2026-01-02' },
      { words: [word('a', 'remote')], lastUpdated: '2026-01-01' }
    );
    expect(merged.words[0].definition).toBe('local');
  });

  it('collapses the same word added on two devices to its most recently edited copy, the same one on both', () => {
    const one = { words: [word('user-1', 'old', '2026-01-01', 'Laconic')], lastUpdated: '2026-01-01' };
    const two = { words: [word('user-2', 'new', '2026-01-02', 'laconic ')], lastUpdated: '2026-01-02' };
    for (const merged of [mergeVocabularyWithAliases(one, two), mergeVocabularyWithAliases(two, one)]) {
      expect(merged.vocabulary.words.map(w => w.definition)).toEqual(['new']);
      expect(merged.replaced).toEqual({ 'user-1': 'user-2' });
    }
  });

  it('breaks a duplicate edit-time tie by the lower id', () => {
    const one = { words: [word('user-1', 'a', '2026-01-01', 'sere')], lastUpdated: '2026-01-01' };
    const two = { words: [word('user-2', 'b', '2026-01-01', 'Sere')], lastUpdated: '2026-01-01' };
    expect(mergeVocabulary(one, two).words.map(w => w.id)).toEqual(['user-1']);
    expect(mergeVocabulary(two, one).words.map(w => w.id)).toEqual(['user-1']);
  });

  it('moves study history from a collapsed duplicate to the surviving word', () => {
    const profile: IRTProfile = { ability: 0, cardHistory: { 'user-1': { ...entry('user-1', '2026-01-03', 3), timesAnswered: 4 } } };
    const moved = carryOverHistory(profile, { 'user-1': 'user-2' });
    expect(Object.keys(moved.cardHistory)).toEqual(['user-2']);
    expect(moved.cardHistory['user-2']).toMatchObject({ cardId: 'user-2', leitnerBox: 3, timesAnswered: 4 });
    expect(carryOverHistory(profile, {})).toBe(profile);
  });

  it('collapses the same word captured on two devices to one pending entry', () => {
    const pending = (id: string, w: string, addedAt: string) => ({ id, word: w, addedAt, status: 'queued' as const });
    const one = { words: [], pending: [pending('p1', 'sere', '2026-01-02')], lastUpdated: '2026-01-02' };
    const two = { words: [], pending: [pending('p2', 'Sere', '2026-01-01')], lastUpdated: '2026-01-01' };
    expect(mergeVocabulary(one, two).pending?.map(p => p.id)).toEqual(['p2']);
    expect(mergeVocabulary(two, one).pending?.map(p => p.id)).toEqual(['p2']);
  });

  it('drops a pending word that already exists as a card under another id', () => {
    const merged = mergeVocabulary(
      { words: [word('card', 'd', undefined, 'argot')], lastUpdated: '2026-01-01' },
      { words: [], pending: [{ id: 'p', word: 'Argot', addedAt: '2026-01-02', status: 'queued' }], lastUpdated: '2026-01-02' }
    );
    expect(merged.pending).toEqual([]);
  });

  it('survives an old-format row with no words array', () => {
    const merged = mergeVocabulary(
      { words: [word('a')], lastUpdated: '2026-01-01' },
      { lastUpdated: '2026-01-02', deletedIds: 'bad' } as unknown as UserVocabulary
    );
    expect(merged.words.map(w => w.id)).toEqual(['a']);
    expect(merged.deletedIds).toEqual([]);
  });

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

describe('mergeCounter (per-device counts)', () => {
  it('adds up what each device counted', () => {
    // Both started from 6 legacy answers, then A did 3 and B did 2 without syncing
    expect(mergeCounter(9, { A: 3 }, 8, { B: 2 })).toEqual({ total: 11, buckets: { A: 3, B: 2 } });
  });

  it('treats legacy totals like the old max merge', () => {
    expect(mergeCounter(10, undefined, 12, undefined)).toEqual({ total: 12, buckets: undefined });
  });

  it('does not double count a total re-uploaded by an older app version', () => {
    // Cloud had legacy 4 + A 5; an old client added 3 and wrote 12 without the breakdown
    expect(mergeCounter(9, { A: 5 }, 12, undefined).total).toBe(12);
  });

  it('is idempotent and order-independent', () => {
    const a = mergeCounter(9, { A: 3 }, 8, { B: 2 });
    expect(mergeCounter(a.total, a.buckets, a.total, a.buckets)).toEqual(a);
    expect(mergeCounter(8, { B: 2 }, 9, { A: 3 })).toEqual(a);
  });
});

describe('mergeCounts', () => {
  it('takes the max per card for legacy counts', () => {
    expect(mergeCounts({ a: 2, b: 1 }, { a: 1, c: 3 }).counts).toEqual({ a: 2, b: 1, c: 3 });
  });

  it('adds misses made on different devices', () => {
    const merged = mergeCounts({ a: 3 }, { a: 2, b: 1 }, { A: { a: 2 } }, { B: { a: 1, b: 1 } });
    expect(merged.counts).toEqual({ a: 4, b: 1 }); // 1 legacy + 2 on A + 1 on B
    expect(merged.byDevice).toEqual({ A: { a: 2 }, B: { a: 1, b: 1 } });
  });

  it('ignores non-numeric counts', () => {
    expect(mergeCounts({ a: 1 }, { a: 'x', b: null, c: 4 } as unknown as Record<string, number>).counts).toEqual({ a: 1, c: 4 });
  });
});

describe('mergeCardHistory', () => {
  it('adds answers made on two devices and takes scheduling from the newer copy', () => {
    const base = { cardId: 'a', timesAnswered: 3, timesCorrect: 2 };
    const onA = { ...base, timesAnswered: 5, timesCorrect: 4, leitnerBox: 2, lastAnsweredDate: '2026-01-02', byDevice: { A: { n: 2, c: 2 } } };
    const onB = { ...base, timesAnswered: 4, timesCorrect: 2, leitnerBox: 0, lastAnsweredDate: '2026-01-03', byDevice: { B: { n: 1 } } };
    const merged = mergeCardHistory(onA, onB);
    expect(merged).toMatchObject({ timesAnswered: 6, timesCorrect: 4, leitnerBox: 0, lastAnsweredDate: '2026-01-03' });
    expect(merged.byDevice).toEqual({ A: { n: 2, c: 2 }, B: { n: 1 } });
    expect(mergeCardHistory(onB, onA)).toEqual(merged);
  });
});

describe('mergeStats', () => {
  it('adds up study done on two devices', () => {
    const shared = { lastStudyDate: '2026-01-05', streak: 1 };
    const merged = mergeStats(
      { ...shared, totalCardsReviewed: 13, totalCorrect: 10, totalIncorrect: 3, devices: { A: { reviewed: 3, correct: 2, incorrect: 1 } } },
      { ...shared, totalCardsReviewed: 15, totalCorrect: 12, totalIncorrect: 3, devices: { B: { reviewed: 5, correct: 4, incorrect: 1 } } }
    );
    expect(merged).toMatchObject({ totalCardsReviewed: 18, totalCorrect: 14, totalIncorrect: 4 });
    expect(merged.devices).toEqual({ A: { reviewed: 3, correct: 2, incorrect: 1 }, B: { reviewed: 5, correct: 4, incorrect: 1 } });
  });

  it('keeps the latest streak and the larger totals', () => {
    const merged = mergeStats(
      { totalCardsReviewed: 10, totalCorrect: 8, totalIncorrect: 2, lastStudyDate: '2026-01-05', streak: 3 },
      { totalCardsReviewed: 12, totalCorrect: 7, totalIncorrect: 5, lastStudyDate: '2026-01-04', streak: 2 }
    );
    expect(merged).toEqual({ totalCardsReviewed: 12, totalCorrect: 8, totalIncorrect: 5, lastStudyDate: '2026-01-05', streak: 3 });
  });

  it('takes the larger streak when both studied on the same last day', () => {
    const day = '2026-01-05';
    const merged = mergeStats(
      { totalCardsReviewed: 1, totalCorrect: 1, totalIncorrect: 0, lastStudyDate: day, streak: 2 },
      { totalCardsReviewed: 1, totalCorrect: 1, totalIncorrect: 0, lastStudyDate: day, streak: 4 }
    );
    expect(merged.streak).toBe(4);
  });

  it('fills missing fields of a partial row with zeros instead of NaN', () => {
    const merged = mergeStats(
      { totalCardsReviewed: 3, totalCorrect: 2, totalIncorrect: 1, lastStudyDate: '2026-01-01', streak: 1 },
      { lastStudyDate: '2026-01-02' } as never
    );
    expect(merged).toEqual({ totalCardsReviewed: 3, totalCorrect: 2, totalIncorrect: 1, lastStudyDate: '2026-01-02', streak: 0 });
  });
});

// Each test below fails if a specific merge rule is removed (found by mutation testing)
describe('merge rules that need their own check', () => {
  it('sorts ability history even when the remote copy has the earlier points', () => {
    const merged = mergeProfiles(
      { ability: 0, cardHistory: {}, abilityHistory: [{ date: '2026-01-03', ability: 3 }] },
      { ability: 0, cardHistory: {}, abilityHistory: [{ date: '2026-01-01', ability: 1 }, { date: '2026-01-02', ability: 2 }] }
    );
    expect(merged.abilityHistory!.map(p => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('drops corrupt card entries from the remote copy', () => {
    const remote = { ability: 0, cardHistory: { b: entry('b', '2026-01-01', 1), junk: 'x', empty: null } };
    const merged = mergeProfiles(
      { ability: 0, cardHistory: { a: entry('a', '2026-01-01', 1) } },
      remote as unknown as IRTProfile
    );
    expect(Object.keys(merged.cardHistory).sort()).toEqual(['a', 'b']);
  });

  it('keeps the newer updatedAt whichever side it comes from', () => {
    const older: IRTProfile = { ability: 0, cardHistory: {}, updatedAt: '2026-01-01' };
    const newer: IRTProfile = { ability: 1, cardHistory: {}, updatedAt: '2026-01-02' };
    expect(mergeProfiles(older, newer).updatedAt).toBe('2026-01-02');
    expect(mergeProfiles(newer, older).updatedAt).toBe('2026-01-02');
  });

  it('gives a word edited at the same moment on both devices to the more recently edited list', () => {
    const stamp = '2026-01-01T00:00:00Z';
    const newerList = { words: [word('a', 'newer list', stamp)], lastUpdated: '2026-01-02' };
    const olderList = { words: [word('a', 'older list', stamp)], lastUpdated: '2026-01-01' };
    expect(mergeVocabulary(newerList, olderList).words[0].definition).toBe('newer list');
    expect(mergeVocabulary(olderList, newerList).words[0].definition).toBe('newer list');
  });

  it('keeps the newer vocabulary edit time whichever side it comes from', () => {
    const older = { words: [word('a')], lastUpdated: '2026-01-01' };
    const newer = { words: [word('a')], lastUpdated: '2026-01-02' };
    expect(mergeVocabulary(older, newer).lastUpdated).toBe('2026-01-02');
    expect(mergeVocabulary(newer, older).lastUpdated).toBe('2026-01-02');
  });

  it('takes each stats total from whichever side is larger', () => {
    const small = { totalCardsReviewed: 5, totalCorrect: 3, totalIncorrect: 2, lastStudyDate: '2026-01-01', streak: 1 };
    const big = { totalCardsReviewed: 9, totalCorrect: 6, totalIncorrect: 3, lastStudyDate: '2026-01-01', streak: 1 };
    for (const merged of [mergeStats(small, big), mergeStats(big, small)]) {
      expect(merged).toMatchObject({ totalCardsReviewed: 9, totalCorrect: 6, totalIncorrect: 3 });
    }
  });
});
