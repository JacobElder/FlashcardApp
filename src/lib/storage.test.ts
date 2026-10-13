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
  clearAllData,
  localDateString,
  subscribeToStorage,
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
