import type { CardProgress, UserVocabulary, VocabularyCard } from '../types';

const STORAGE_KEYS = {
  TRIVIA_PROGRESS: 'nyc-trivia-progress',
  VOCABULARY_PROGRESS: 'nyc-vocabulary-progress',
  USER_VOCABULARY: 'nyc-user-vocabulary',
  STUDY_STATS: 'nyc-study-stats',
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

// Trivia Progress
export function getTriviaProgress(): Record<string, CardProgress> {
  return getFromStorage(STORAGE_KEYS.TRIVIA_PROGRESS, {});
}

export function setTriviaProgress(progress: Record<string, CardProgress>): void {
  setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, progress);
}

export function updateTriviaCardProgress(cardId: string, progress: CardProgress): void {
  const current = getTriviaProgress();
  current[cardId] = progress;
  setTriviaProgress(current);
}

// Vocabulary Progress
export function getVocabularyProgress(): Record<string, CardProgress> {
  return getFromStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, {});
}

export function setVocabularyProgress(progress: Record<string, CardProgress>): void {
  setToStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, progress);
}

export function updateVocabularyCardProgress(cardId: string, progress: CardProgress): void {
  const current = getVocabularyProgress();
  current[cardId] = progress;
  setVocabularyProgress(current);
}

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

  // Also remove progress for this word
  const progress = getVocabularyProgress();
  delete progress[wordId];
  setVocabularyProgress(progress);
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

// Clear all data
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    removeFromStorage(key);
  });
}
