import type { UserVocabulary, VocabularyCard } from '../types';
import { syncToCloud } from './sync';

const STORAGE_KEYS = {
  TRIVIA_PROGRESS: 'nyc-trivia-progress',
  VOCABULARY_PROGRESS: 'nyc-vocabulary-progress',
  USER_VOCABULARY: 'nyc-user-vocabulary',
  STUDY_STATS: 'nyc-study-stats',
  INCORRECT_COUNTS: 'nyc-incorrect-counts',
} as const;

/**
 * Generic localStorage get with JSON parsing
 */
export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Generic localStorage set with JSON stringifying
 */
export function setToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    
    // Asynchronously push this update to Supabase so it's persisted in the cloud
    syncToCloud().catch(err => console.error("Cloud sync failed:", err));
  } catch (error) {
    console.error(`Error writing to localStorage key "${key}":`, error);
  }
}

/**
 * Remove item from localStorage
 */
export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage key "${key}":`, error);
  }
}

// Removed SM-2 progress functions

// User-added vocabulary
export function getUserVocabulary(): UserVocabulary {
  return getFromStorage<UserVocabulary>(STORAGE_KEYS.USER_VOCABULARY, {
    words: [],
    lastUpdated: new Date().toISOString(),
  });
}

export function setUserVocabulary(vocabulary: UserVocabulary): void {
  setToStorage(STORAGE_KEYS.USER_VOCABULARY, vocabulary);
}

export function addUserWord(word: VocabularyCard): void {
  const current = getUserVocabulary();
  current.words.push(word);
  current.lastUpdated = new Date().toISOString();
  setUserVocabulary(current);
}

export function updateUserWord(wordId: string, updates: Partial<VocabularyCard>): void {
  const current = getUserVocabulary();
  const index = current.words.findIndex(w => w.id === wordId);
  if (index !== -1) {
    current.words[index] = { ...current.words[index], ...updates };
    current.lastUpdated = new Date().toISOString();
    setUserVocabulary(current);
  }
}

export function deleteUserWord(wordId: string): void {
  const current = getUserVocabulary();
  current.words = current.words.filter(w => w.id !== wordId);
  current.lastUpdated = new Date().toISOString();
  setUserVocabulary(current);

  // Progress is now tracked via IRT profiles per deck
}

// Study statistics
export interface StudyStats {
  totalCardsReviewed: number;
  totalCorrect: number;
  totalIncorrect: number;
  lastStudyDate: string;
  streak: number;
}

export function getStudyStats(): StudyStats {
  return getFromStorage<StudyStats>(STORAGE_KEYS.STUDY_STATS, {
    totalCardsReviewed: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    lastStudyDate: '',
    streak: 0,
  });
}

export function updateStudyStats(correct: number, incorrect: number): void {
  const stats = getStudyStats();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  stats.totalCardsReviewed += correct + incorrect;
  stats.totalCorrect += correct;
  stats.totalIncorrect += incorrect;

  // Update streak
  if (stats.lastStudyDate === yesterday) {
    stats.streak += 1;
  } else if (stats.lastStudyDate !== today) {
    stats.streak = 1;
  }

  stats.lastStudyDate = today;
  setToStorage(STORAGE_KEYS.STUDY_STATS, stats);
}

// Incorrect counts — tracks how many times each card has been rated "again" (0)
export function getIncorrectCounts(): Record<string, number> {
  return getFromStorage<Record<string, number>>(STORAGE_KEYS.INCORRECT_COUNTS, {});
}

export function incrementIncorrectCount(cardId: string): void {
  const counts = getIncorrectCounts();
  counts[cardId] = (counts[cardId] ?? 0) + 1;
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, counts);
}

// Clear all data
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    removeFromStorage(key);
  });
}
