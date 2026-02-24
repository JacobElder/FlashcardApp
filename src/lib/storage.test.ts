import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFromStorage,
  setToStorage,
  removeFromStorage,
  getTriviaProgress,
  setTriviaProgress,
  getVocabularyProgress,
  setVocabularyProgress,
  getUserVocabulary,
  addUserWord,
  deleteUserWord,
  getStudyStats,
  updateStudyStats,
  clearAllData,
} from './storage';
import type { VocabularyCard } from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Storage Utilities', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getFromStorage', () => {
    it('should return default value when key does not exist', () => {
      const result = getFromStorage('nonexistent', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should return parsed value when key exists', () => {
      localStorageMock.setItem('testKey', JSON.stringify({ foo: 'bar' }));
      const result = getFromStorage('testKey', {});
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return default value on parse error', () => {
      localStorageMock.setItem('badJson', 'not valid json');
      const result = getFromStorage('badJson', { fallback: true });
      expect(result).toEqual({ fallback: true });
    });
  });

  describe('setToStorage', () => {
    it('should store stringified value', () => {
      setToStorage('testKey', { hello: 'world' });
      expect(localStorageMock.getItem('testKey')).toBe('{"hello":"world"}');
    });
  });

  describe('removeFromStorage', () => {
    it('should remove item from storage', () => {
      localStorageMock.setItem('toRemove', 'value');
      removeFromStorage('toRemove');
      expect(localStorageMock.getItem('toRemove')).toBeNull();
    });
  });

  describe('Trivia Progress', () => {
    it('should get empty object by default', () => {
      const progress = getTriviaProgress();
      expect(progress).toEqual({});
    });

    it('should set and get progress', () => {
      const progress = {
        'card-1': {
          cardId: 'card-1',
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          nextReviewDate: '2024-01-01',
        },
      };
      setTriviaProgress(progress);
      expect(getTriviaProgress()).toEqual(progress);
    });
  });

  describe('Vocabulary Progress', () => {
    it('should get empty object by default', () => {
      const progress = getVocabularyProgress();
      expect(progress).toEqual({});
    });

    it('should set and get progress', () => {
      const progress = {
        'vocab-1': {
          cardId: 'vocab-1',
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          nextReviewDate: '2024-01-01',
        },
      };
      setVocabularyProgress(progress);
      expect(getVocabularyProgress()).toEqual(progress);
    });
  });

  describe('User Vocabulary', () => {
    it('should get default structure', () => {
      const vocab = getUserVocabulary();
      expect(vocab.words).toEqual([]);
      expect(vocab.lastUpdated).toBeDefined();
    });

    it('should add user word', () => {
      const word: VocabularyCard = {
        id: 'user-1',
        type: 'vocabulary',
        word: 'test',
        definition: 'a test word',
        front: 'test',
        back: 'a test word',
        isUserAdded: true,
      };

      addUserWord(word);
      const vocab = getUserVocabulary();
      expect(vocab.words).toHaveLength(1);
      expect(vocab.words[0].word).toBe('test');
    });

    it('should delete user word', () => {
      const word: VocabularyCard = {
        id: 'user-1',
        type: 'vocabulary',
        word: 'test',
        definition: 'a test word',
        front: 'test',
        back: 'a test word',
        isUserAdded: true,
      };

      addUserWord(word);
      deleteUserWord('user-1');
      const vocab = getUserVocabulary();
      expect(vocab.words).toHaveLength(0);
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
  });

  describe('clearAllData', () => {
    it('should clear all storage keys', () => {
      setTriviaProgress({ 'card-1': { cardId: 'card-1', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: '' } });
      setVocabularyProgress({ 'vocab-1': { cardId: 'vocab-1', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: '' } });

      clearAllData();

      expect(getTriviaProgress()).toEqual({});
      expect(getVocabularyProgress()).toEqual({});
    });
  });
});
