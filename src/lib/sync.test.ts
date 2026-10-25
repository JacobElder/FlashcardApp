import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IRTProfile, UserVocabulary } from '../types';

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

// Fake Supabase table holding one user's row. Reads and writes can fail, and
// `beforeWrite` lets a test change the row between a sync's read and its write
// (another device or the CLI writing at the same time).
const db = vi.hoisted(() => ({
  row: null as Row | null,
  writes: [] as Row[],
  reads: 0,
  readError: null as DbError | null,
  readThrows: null as Error | null,
  writeError: null as DbError | null,
  beforeWrite: null as (() => void) | null,
  /** Resolve to release a read that a test is holding open. */
  readGate: null as Promise<void> | null,
  /** Columns the fake table lacks, as when the schema hasn't been updated yet. */
  missingColumns: [] as string[],
}));

vi.mock('./supabase', () => {
  const runBeforeWrite = () => {
    const hook = db.beforeWrite;
    db.beforeWrite = null;
    hook?.();
  };
  return {
    getSupabase: () => ({
      from: () => ({
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              db.reads += 1;
              const missing = db.missingColumns.find(c => columns.includes(c));
              if (missing) return { data: null, error: { message: `column user_progress.${missing} does not exist`, code: '42703' } };
              if (db.readGate) await db.readGate;
              if (db.readThrows) throw db.readThrows;
              if (db.readError) return { data: null, error: db.readError };
              return { data: db.row ? structuredClone(db.row) : null, error: null };
            },
          }),
        }),
        update: (values: Row) => {
          const filters: Row = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            async select() {
              runBeforeWrite();
              if (db.writeError) return { data: null, error: db.writeError };
              // Compare-and-swap: only matches if updated_at is what the writer read
              if (!db.row || db.row.updated_at !== filters.updated_at) return { data: [], error: null };
              db.row = { ...db.row, ...values };
              db.writes.push(values);
              return { data: [{ user_id: filters.user_id }], error: null };
            },
          };
          return chain;
        },
        insert: async (values: Row) => {
          runBeforeWrite();
          const missing = db.missingColumns.find(c => c in values);
          if (missing) return { error: { message: `Could not find the '${missing}' column`, code: 'PGRST204' } };
          if (db.writeError) return { error: db.writeError };
          if (db.row) return { error: { message: 'duplicate key', code: '23505' } };
          db.row = values;
          db.writes.push(values);
          return { error: null };
        },
        upsert: async (values: Row) => {
          runBeforeWrite();
          const missing = db.missingColumns.find(c => c in values);
          if (missing) return { error: { message: `Could not find the '${missing}' column`, code: 'PGRST204' } };
          if (db.writeError) return { error: db.writeError };
          db.row = values;
          db.writes.push(values);
          return { error: null };
        },
      }),
    }),
  };
});

import { claimLocalData, flushPush, getSyncStatus, hasUnsyncedChanges, startSync, stopSync } from './sync';
import { STORAGE_KEYS, getFromStorage, getStorageOwner, setToStorage } from './storage';

const profile = (cards: Record<string, string>): IRTProfile => ({
  ability: 0,
  cardHistory: Object.fromEntries(
    Object.entries(cards).map(([id, date]) => [id, { cardId: id, timesAnswered: 1, timesCorrect: 1, lastAnsweredDate: date }])
  ),
});

const cardIds = (p: unknown) => Object.keys((p as IRTProfile).cardHistory).sort();
const localTrivia = () => getFromStorage<IRTProfile>(STORAGE_KEYS.TRIVIA_PROGRESS, { ability: 0, cardHistory: {} });
const vocab = (words: string[], lastUpdated = '2026-01-01'): UserVocabulary => ({
  words: words.map(id => ({ id, type: 'vocabulary', word: id, definition: 'd', front: id, back: 'd', updatedAt: lastUpdated })),
  deletedIds: [],
  lastUpdated,
});

/** Seed the cloud row as some other device saved it. */
function seed(row: Row) {
  db.row = { updated_at: '2026-01-01T00:00:00.000Z', ...row };
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

/** Let queued syncs finish (flushPush returns the sync queue). */
const settle = () => flushPush();

describe('cloud sync', () => {
  beforeEach(() => {
    db.row = null;
    db.writes = [];
    db.reads = 0;
    db.readError = null;
    db.readThrows = null;
    db.writeError = null;
    db.beforeWrite = null;
    db.readGate = null;
    db.missingColumns = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    stopSync();
    vi.useRealTimers();
  });

  it('merges cloud progress with local progress instead of overwriting it', async () => {
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ local: '2026-01-02' }));
    seed({ trivia_profile: profile({ remote: '2026-01-01' }) });

    await startSync('user-1');

    expect(cardIds(localTrivia())).toEqual(['local', 'remote']);
    // The cloud was missing the local card, so the merged result is sent back
    expect(db.writes).toHaveLength(1);
    expect(cardIds(db.row!.trivia_profile)).toEqual(['local', 'remote']);
    expect(getSyncStatus().status).toBe('synced');
  });

  it('creates the row on first sync', async () => {
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }));
    await startSync('user-1');
    expect(db.row).toMatchObject({ user_id: 'user-1' });
    expect(cardIds(db.row!.trivia_profile)).toEqual(['a']);
  });

  it('merges Data Science progress like the other decks', async () => {
    setToStorage(STORAGE_KEYS.DATA_SCIENCE_PROGRESS, profile({ 'ds-1': '2026-01-02' }));
    seed({ data_science_profile: profile({ 'ds-2': '2026-01-01' }) });
    await startSync('user-1');
    expect(cardIds(getFromStorage(STORAGE_KEYS.DATA_SCIENCE_PROGRESS, null))).toEqual(['ds-1', 'ds-2']);
    expect(cardIds(db.row!.data_science_profile)).toEqual(['ds-1', 'ds-2']);
  });

  it('keeps syncing the other decks when the database has no Data Science column yet', async () => {
    db.missingColumns = ['data_science_profile'];
    setToStorage(STORAGE_KEYS.DATA_SCIENCE_PROGRESS, profile({ 'ds-1': '2026-01-02' }));
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ local: '2026-01-02' }));
    seed({ trivia_profile: profile({ remote: '2026-01-01' }) });

    await startSync('user-1');

    expect(getSyncStatus().status).toBe('synced');
    expect(cardIds(db.row!.trivia_profile)).toEqual(['local', 'remote']);
    expect(db.row).not.toHaveProperty('data_science_profile');
    // The deck's progress stays on this device until the column exists
    expect(cardIds(getFromStorage(STORAGE_KEYS.DATA_SCIENCE_PROGRESS, null))).toEqual(['ds-1']);
  });

  it('creates the row without the Data Science column when the database lacks it', async () => {
    db.missingColumns = ['data_science_profile'];
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }));
    await startSync('user-1');
    expect(getSyncStatus().status).toBe('synced');
    expect(cardIds(db.row!.trivia_profile)).toEqual(['a']);
  });

  it('does not write when the cloud already has everything', async () => {
    seed({ trivia_profile: profile({ a: '2026-01-01' }) });
    await startSync('user-1');
    db.writes = [];
    // A second sync finds local == cloud
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, localTrivia());
    await flushPush();
    expect(db.writes).toHaveLength(0);
    expect(getSyncStatus().status).toBe('synced');
  });

  it('batches a burst of local writes into one sync', async () => {
    await startSync('user-1');
    db.writes = [];
    vi.useFakeTimers();

    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }));
    setToStorage(STORAGE_KEYS.STUDY_STATS, { totalCardsReviewed: 1, totalCorrect: 1, totalIncorrect: 0, lastStudyDate: '2026-01-01', streak: 1 });
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    expect(db.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].incorrect_counts).toEqual({ a: 1 });
  });

  it('does not push writes that came from the cloud', async () => {
    await startSync('user-1');
    db.writes = [];
    vi.useFakeTimers();
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }), 'remote');
    await vi.advanceTimersByTimeAsync(5000);
    expect(db.writes).toHaveLength(0);
  });

  it('reports write failures and retries on the next flush', async () => {
    await startSync('user-1');
    db.writes = [];
    db.writeError = { message: 'permission denied' };

    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    await flushPush();
    expect(getSyncStatus()).toEqual({ status: 'error', error: 'permission denied' });
    expect(hasUnsyncedChanges()).toBe(true);

    db.writeError = null;
    await flushPush();
    expect(db.writes).toHaveLength(1);
    expect(getSyncStatus().status).toBe('synced');
    expect(hasUnsyncedChanges()).toBe(false);
  });

  describe('never overwrites cloud data it has not merged', () => {
    it('after the first download fails', async () => {
      seed({ trivia_profile: profile({ remoteCard: '2026-01-01' }) });
      db.readError = { message: 'timeout' };
      await startSync('user-1');
      expect(getSyncStatus().status).toBe('error');

      db.readError = null;
      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ localCard: '2026-01-02' }));
      await flushPush();

      expect(cardIds(db.row!.trivia_profile)).toEqual(['localCard', 'remoteCard']);
      expect(cardIds(localTrivia())).toEqual(['localCard', 'remoteCard']);
    });

    it('after starting offline and studying before reconnecting', async () => {
      seed({ trivia_profile: profile({ remoteCard: '2026-01-01' }) });
      setOnline(false);
      await startSync('user-1');
      expect(getSyncStatus().status).toBe('offline');
      expect(hasUnsyncedChanges()).toBe(true);

      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ localCard: '2026-01-02' }));
      await flushPush();
      expect(db.writes).toHaveLength(0);

      setOnline(true);
      window.dispatchEvent(new Event('online'));
      await settle();

      expect(cardIds(db.row!.trivia_profile)).toEqual(['localCard', 'remoteCard']);
      expect(getSyncStatus().status).toBe('synced');
    });

    it('when another writer (e.g. the words:apply script) changes the row mid-sync', async () => {
      seed({ user_vocabulary: vocab(['a']) });
      await startSync('user-1');

      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ localCard: '2026-01-02' }));
      db.beforeWrite = () => {
        db.row = { ...db.row, user_vocabulary: vocab(['a', 'fromCli'], '2026-01-03'), updated_at: '2026-01-03T00:00:00.000Z' };
      };
      await flushPush();

      const words = (db.row!.user_vocabulary as UserVocabulary).words.map(w => w.id).sort();
      expect(words).toEqual(['a', 'fromCli']);
      expect(cardIds(db.row!.trivia_profile)).toEqual(['localCard']);
      expect(db.reads).toBeGreaterThanOrEqual(3); // initial sync + first attempt + re-merge
    });

    it('when another device creates the row first', async () => {
      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ mine: '2026-01-02' }));
      db.beforeWrite = () => seed({ trivia_profile: profile({ theirs: '2026-01-01' }) });
      await startSync('user-1');
      expect(cardIds(db.row!.trivia_profile)).toEqual(['mine', 'theirs']);
    });

    it('gives up with an error if the row keeps changing', async () => {
      seed({ trivia_profile: profile({}) });
      await startSync('user-1');
      let n = 0;
      const keepChanging = () => {
        db.row = { ...db.row, updated_at: `2026-02-0${++n}T00:00:00.000Z` };
        db.beforeWrite = keepChanging;
      };
      db.beforeWrite = keepChanging;
      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile({ a: '2026-01-01' }));
      await flushPush();
      db.beforeWrite = null;

      expect(getSyncStatus().status).toBe('error');
      expect(hasUnsyncedChanges()).toBe(true);
    });
  });

  it('survives a partial or old-format cloud row', async () => {
    seed({
      trivia_profile: { cardHistory: 'garbage' },
      study_stats: { lastStudyDate: '2026-01-01' },
      user_vocabulary: { lastUpdated: '2026-01-01' },
      incorrect_counts: { a: 'x', b: 2 },
    });
    setToStorage(STORAGE_KEYS.STUDY_STATS, { totalCardsReviewed: 3, totalCorrect: 2, totalIncorrect: 1, lastStudyDate: '2025-12-31', streak: 1 });
    setToStorage(STORAGE_KEYS.USER_VOCABULARY, vocab(['w']));

    await startSync('user-1');

    expect(getSyncStatus().status).toBe('synced');
    expect(db.row!.study_stats).toEqual({ totalCardsReviewed: 3, totalCorrect: 2, totalIncorrect: 1, lastStudyDate: '2026-01-01', streak: 0 });
    expect((db.row!.user_vocabulary as UserVocabulary).words.map(w => w.id)).toEqual(['w']);
    expect(db.row!.incorrect_counts).toEqual({ b: 2 });
  });

  it('reports an error instead of staying stuck on "syncing" when something throws', async () => {
    db.readThrows = new Error('boom');
    await startSync('user-1');
    expect(getSyncStatus()).toEqual({ status: 'error', error: 'boom' });
    expect(hasUnsyncedChanges()).toBe(true);
  });

  it('counts a sync in progress as unsynced', async () => {
    let release!: () => void;
    db.readGate = new Promise(resolve => { release = resolve; });
    const done = startSync('user-1');
    await Promise.resolve();
    expect(getSyncStatus().status).toBe('syncing');
    expect(hasUnsyncedChanges()).toBe(true);
    release();
    await done;
    expect(hasUnsyncedChanges()).toBe(false);
  });

  it('ignores a download that lands after sign-out', async () => {
    seed({ trivia_profile: profile({ remote: '2026-01-01' }) });
    let release!: () => void;
    db.readGate = new Promise(resolve => { release = resolve; });
    const done = startSync('user-1');
    await Promise.resolve();
    stopSync();
    release();
    await done;

    expect(cardIds(localTrivia())).toEqual([]);
    expect(db.writes).toHaveLength(0);
    expect(getSyncStatus().status).toBe('idle');
  });

  it('downloads cloud progress as soon as the device reconnects, even with no local changes', async () => {
    seed({ trivia_profile: profile({ remoteCard: '2026-01-01' }) });
    setOnline(false);
    await startSync('user-1');
    expect(db.reads).toBe(0);

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await settle(); // nothing is unsynced, so only the reconnect can start this sync

    expect(db.reads).toBe(1);
    expect(cardIds(localTrivia())).toEqual(['remoteCard']);
    expect(getSyncStatus().status).toBe('synced');
  });

  it('shows no error for a sync that fails after sign-out', async () => {
    let release!: () => void;
    db.readGate = new Promise(resolve => { release = resolve; });
    db.readThrows = new Error('network down');
    const done = startSync('user-1');
    await Promise.resolve();
    stopSync();
    release();
    await done;

    expect(getSyncStatus()).toEqual({ status: 'idle', error: null });
    expect(hasUnsyncedChanges()).toBe(false);
  });

  it('syncs only once when started twice for the same user', async () => {
    seed({ trivia_profile: profile({ remote: '2026-01-01' }) });
    await Promise.all([startSync('user-1'), startSync('user-1')]);
    await startSync('user-1');
    expect(db.reads).toBe(1);
  });

  it('flushes when the page is hidden and re-syncs on return after a minute', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await startSync('user-1');
    const readsAfterStart = db.reads;
    const setVisibility = (state: DocumentVisibilityState) => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      document.dispatchEvent(new Event('visibilitychange'));
    };

    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });
    setVisibility('hidden');
    await settle();
    expect(db.row!.incorrect_counts).toEqual({ a: 1 });

    // Back within a minute: no extra download
    const readsAfterFlush = db.reads;
    setVisibility('visible');
    await settle();
    expect(db.reads).toBe(readsAfterFlush);

    // Back after a minute: picks up another device's progress
    seed({ ...db.row, trivia_profile: profile({ otherDevice: '2026-01-05' }), updated_at: '2026-01-05T00:00:00.000Z' });
    now.mockReturnValue(1_000_000 + 61_000);
    setVisibility('visible');
    await settle();
    expect(db.reads).toBeGreaterThan(readsAfterStart);
    expect(cardIds(localTrivia())).toEqual(['otherDevice']);
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
