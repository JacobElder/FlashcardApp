import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IRTProfile } from '../types';

// Fake Supabase table: one row per user, recording every upsert
const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  upsertError: null as { message: string } | null,
}));

vi.mock('./supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.row, error: null }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        if (db.upsertError) return { error: db.upsertError };
        db.upserts.push(row);
        db.row = row;
        return { error: null };
      },
    }),
  }),
}));

import { claimLocalData, flushPush, getSyncStatus, startSync, stopSync } from './sync';
import { STORAGE_KEYS, getFromStorage, getStorageOwner, setToStorage } from './storage';

const profile = (cards: Record<string, string>): IRTProfile => ({
  ability: 0,
  cardHistory: Object.fromEntries(
    Object.entries(cards).map(([id, date]) => [id, { cardId: id, timesAnswered: 1, timesCorrect: 1, lastAnsweredDate: date }])
  ),
});

describe('cloud sync', () => {
  beforeEach(() => {
    db.row = null;
    db.upserts = [];
    db.upsertError = null;
  });

  afterEach(() => {
    stopSync();
    vi.useRealTimers();
  });

  it('merges cloud progress with local progress instead of overwriting it', async () => {
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ local: '2026-01-02' }));
    db.row = { trivia_profile: profile({ remote: '2026-01-01' }) };

    await startSync('user-1');

    const merged = getFromStorage<IRTProfile>(STORAGE_KEYS.TRIVIA_PROGRESS, { ability: 0, cardHistory: {} });
    expect(Object.keys(merged.cardHistory).sort()).toEqual(['local', 'remote']);
    // The cloud was missing the local card, so the merged result is pushed back
    expect(db.upserts).toHaveLength(1);
    expect(Object.keys((db.upserts[0].trivia_profile as IRTProfile).cardHistory).sort()).toEqual(['local', 'remote']);
    expect(getSyncStatus().status).toBe('synced');
  });

  it('batches a burst of local writes into one push', async () => {
    db.row = null;
    await startSync('user-1');
    db.upserts = [];
    vi.useFakeTimers();

    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }));
    setToStorage(STORAGE_KEYS.STUDY_STATS, { totalCardsReviewed: 1, totalCorrect: 1, totalIncorrect: 0, lastStudyDate: '2026-01-01', streak: 1 });
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    expect(db.upserts).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].incorrect_counts).toEqual({ a: 1 });
  });

  it('does not push writes that came from the cloud', async () => {
    await startSync('user-1');
    db.upserts = [];
    vi.useFakeTimers();
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }), 'remote');
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.upserts).toHaveLength(0);
  });

  it('reports push failures and retries on the next flush', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await startSync('user-1');
    db.upserts = [];
    db.upsertError = { message: 'permission denied' };

    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    await flushPush();
    expect(getSyncStatus()).toEqual({ status: 'error', error: 'permission denied' });

    db.upsertError = null;
    await flushPush();
    expect(db.upserts).toHaveLength(1);
    expect(getSyncStatus().status).toBe('synced');
  });

  it("clears another account's local data before claiming it", () => {
    claimLocalData('user-1');
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 3 });
    claimLocalData('user-1');
    expect(getFromStorage(STORAGE_KEYS.INCORRECT_COUNTS, {})).toEqual({ a: 3 });

    claimLocalData('user-2');
    expect(getFromStorage(STORAGE_KEYS.INCORRECT_COUNTS, {})).toEqual({});
    expect(getStorageOwner()).toBe('user-2');
  });
});
