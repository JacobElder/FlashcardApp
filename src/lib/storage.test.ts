import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  STORAGE_KEYS,
  getFromStorage,
  setToStorage,
  removeFromStorage,
  getUserVocabulary,
  addUserWord,
  updateUserWord,
  deleteUserWord,
  getStudyStats,
  updateStudyStats,
  currentStreak,
  incrementIncorrectCount,
  getIncorrectCounts,
  troubleCardIdsFrom,
  TROUBLE_GRADUATION_STREAK,
  clearAllData,
  localDateString,
  subscribeToStorage,
  subscribeToStorageErrors,
  hasStorageWriteFailed,
  markPendingNotFound,
} from './storage';
import type { VocabularyCard } from '../types';

const word: VocabularyCard = {
  id: 'user-1',
  type: 'vocabulary',
  word: 'test',
  definition: 'a test word',
  front: 'test',
  back: 'a test word',
  isUserAdded: true,
};

describe('Storage Utilities', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getFromStorage', () => {
    it('should return default value when key does not exist', () => {
      const result = getFromStorage('nonexistent', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return parsed value when key exists', () => {
      localStorage.setItem('testKey', JSON.stringify({ foo: 'bar' }));
      const result = getFromStorage('testKey', {});
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return default value on parse error', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem('badJson', 'not valid json');
      const result = getFromStorage('badJson', { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    it('returns the same object for repeated reads', () => {
      setToStorage('stable', { a: 1 });
      expect(getFromStorage('stable', {})).toBe(getFromStorage('stable', {}));
    });
  });

  describe('setToStorage', () => {
    it('should store stringified value', () => {
      setToStorage('testKey', { hello: 'world' });
      expect(localStorage.getItem('testKey')).toBe('{"hello":"world"}');
    });

    it('notifies subscribers with the write origin', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToStorage(listener);
      setToStorage('k', 1);
      setToStorage('k', 2, 'remote');
      unsubscribe();
      setToStorage('k', 3);
      expect(listener.mock.calls).toEqual([['k', 'local'], ['k', 'remote']]);
    });
  });

  describe('removeFromStorage', () => {
    it('should remove item from storage', () => {
      setToStorage('toRemove', 'value');
      removeFromStorage('toRemove');
      expect(localStorage.getItem('toRemove')).toBeNull();
      expect(getFromStorage('toRemove', 'default')).toBe('default');
    });
  });

  describe('User Vocabulary', () => {
    it('should get default structure', () => {
      const vocab = getUserVocabulary();
      expect(vocab.words).toEqual([]);
    });

    it('should add user word without mutating the previous value', () => {
      const before = getUserVocabulary();
      addUserWord(word);
      expect(before.words).toHaveLength(0);
      expect(getUserVocabulary().words.map(w => w.word)).toEqual(['test']);
    });

    it('should update user word', () => {
      addUserWord(word);
      updateUserWord('user-1', { definition: 'changed' });
      expect(getUserVocabulary().words[0].definition).toBe('changed');
    });

    it('should delete user word and remember the deletion', () => {
      addUserWord(word);
      deleteUserWord('user-1');
      const vocab = getUserVocabulary();
      expect(vocab.words).toHaveLength(0);
      expect(vocab.deletedIds).toEqual(['user-1']);
    });
  });

  describe('Study Stats', () => {
    it('should get default stats', () => {
      const stats = getStudyStats();
      expect(stats.totalCardsReviewed).toBe(0);
      expect(stats.streak).toBe(0);
    });

    it('should update stats correctly', () => {
      updateStudyStats(5, 2);
      const stats = getStudyStats();
      expect(stats.totalCardsReviewed).toBe(7);
      expect(stats.totalCorrect).toBe(5);
      expect(stats.totalIncorrect).toBe(2);
      expect(stats.streak).toBe(1);
    });

    it('uses the local calendar day, not UTC', () => {
      // 11pm local time; in UTC (for zones west of Greenwich) this is already tomorrow
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 10, 23, 0));
      updateStudyStats(1, 0);
      expect(getStudyStats().lastStudyDate).toBe('2026-05-10');
      expect(localDateString()).toBe('2026-05-10');
    });

    it('extends the streak on consecutive days and resets after a gap', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 10, 12));
      updateStudyStats(1, 0);
      vi.setSystemTime(new Date(2026, 4, 11, 12));
      updateStudyStats(1, 0);
      updateStudyStats(1, 0); // same day: no change
      expect(getStudyStats().streak).toBe(2);
      vi.setSystemTime(new Date(2026, 4, 14, 12));
      expect(currentStreak(getStudyStats())).toBe(0); // lapsed
      updateStudyStats(1, 0);
      expect(getStudyStats().streak).toBe(1);
    });
  });

  describe('Incorrect counts', () => {
    it('counts misses and flags cards missed more than once', () => {
      incrementIncorrectCount('a');
      incrementIncorrectCount('a');
      incrementIncorrectCount('b');
      expect(getIncorrectCounts()).toEqual({ a: 2, b: 1 });
      expect([...troubleCardIdsFrom(getIncorrectCounts())]).toEqual(['a']);
    });
  });

  describe('clearAllData', () => {
    it('should clear all storage keys', () => {
      addUserWord(word);
      updateStudyStats(1, 0);
      incrementIncorrectCount('a');
      setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, { ability: 1, cardHistory: {} });

      clearAllData();

      for (const key of Object.values(STORAGE_KEYS)) {
        expect(localStorage.getItem(key)).toBeNull();
      }
      expect(getUserVocabulary().words).toEqual([]);
      expect(getStudyStats().totalCardsReviewed).toBe(0);
    });
  });
});

describe('storage failures and other tabs', () => {
  it('keeps a value in memory and reports it when localStorage is full', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const unsubscribe = subscribeToStorageErrors(onError);
    const onChange = vi.fn();
    const unsubscribeChange = subscribeToStorage(onChange);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 1 });

    expect(getFromStorage(STORAGE_KEYS.INCORRECT_COUNTS, {})).toEqual({ a: 1 });
    expect(onChange).toHaveBeenCalledWith(STORAGE_KEYS.INCORRECT_COUNTS, 'local');
    expect(hasStorageWriteFailed()).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { a: 2 });
    expect(onError).toHaveBeenCalledTimes(1); // reported once, not on every write
    unsubscribe();
    unsubscribeChange();
  });

  it('still forgets a key when localStorage.removeItem throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setToStorage('k', { a: 1 });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    removeFromStorage('k');
    expect(getFromStorage('k', null)).toBeNull();
  });

  it('re-reads a key changed by another tab and reports it as external', () => {
    setToStorage('shared', { v: 1 });
    localStorage.setItem('shared', JSON.stringify({ v: 2 }));
    expect(getFromStorage('shared', {})).toEqual({ v: 1 }); // still cached

    const onChange = vi.fn();
    const unsubscribe = subscribeToStorage(onChange);
    window.dispatchEvent(new StorageEvent('storage', { key: 'shared' }));
    expect(getFromStorage('shared', {})).toEqual({ v: 2 });
    expect(onChange).toHaveBeenCalledWith('shared', 'external');

    // A cleared store (key null) drops every cached value
    localStorage.setItem('shared', JSON.stringify({ v: 3 }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getFromStorage('shared', {})).toEqual({ v: 3 });
    expect(onChange).toHaveBeenLastCalledWith('*', 'external');
    unsubscribe();
  });

  it('stamps user words with their own edit time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    addUserWord(word);
    vi.setSystemTime(new Date('2026-03-02T10:00:00Z'));
    updateUserWord(word.id, { definition: 'changed' });
    expect(getUserVocabulary().words[0]).toMatchObject({ definition: 'changed', updatedAt: '2026-03-02T10:00:00.000Z' });
  });
});

// Each test below fails if a specific storage rule is removed (found by mutation testing)
describe('storage rules that need their own check', () => {
  it('keeps the streak alive on the day after the last study day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10, 12));
    updateStudyStats(1, 0);
    vi.setSystemTime(new Date(2026, 4, 11, 20));
    expect(currentStreak(getStudyStats())).toBe(1);
  });

  it('stamps a newly added word with its own edit time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    addUserWord(word);
    expect(getUserVocabulary().words[0].updatedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('does not rewrite a word already marked not found', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    setToStorage(STORAGE_KEYS.USER_VOCABULARY, {
      words: [], deletedIds: [], lastUpdated: '', pending: [{ id: 'p', word: 'zzxq', addedAt: '2026-03-01', status: 'queued' }],
    });
    markPendingNotFound('p');
    const first = getUserVocabulary();
    expect(first.pending?.[0].status).toBe('not_found');

    vi.setSystemTime(new Date('2026-03-02T10:00:00Z'));
    markPendingNotFound('p');
    expect(getUserVocabulary()).toBe(first); // no new write, so a sync isn't triggered for nothing
  });
});

describe('trouble cards', () => {
  const history = (correctStreak?: number) => ({ cardId: 'a', timesAnswered: 3, timesCorrect: 1, correctStreak });

  it('stays on the list until answered correctly enough times in a row', () => {
    const counts = { a: 2 };
    expect([...troubleCardIdsFrom(counts, {})]).toEqual(['a']);
    expect([...troubleCardIdsFrom(counts, { a: history(TROUBLE_GRADUATION_STREAK - 1) })]).toEqual(['a']);
    expect([...troubleCardIdsFrom(counts, { a: history(TROUBLE_GRADUATION_STREAK) })]).toEqual([]);
  });

  it('keeps a card saved before streaks existed on the list', () => {
    expect([...troubleCardIdsFrom({ a: 5 }, { a: history(undefined) })]).toEqual(['a']);
  });
});
