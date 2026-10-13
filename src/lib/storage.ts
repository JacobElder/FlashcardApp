import type { UserVocabulary, VocabularyCard } from '../types';

export const STORAGE_KEYS = {
  TRIVIA_PROGRESS: 'nyc-trivia-progress',
  VOCABULARY_PROGRESS: 'nyc-vocabulary-progress',
  USER_VOCABULARY: 'nyc-user-vocabulary',
  STUDY_STATS: 'nyc-study-stats',
  INCORRECT_COUNTS: 'nyc-incorrect-counts',
  /** Supabase user id the local data belongs to. */
  OWNER: 'nyc-owner-user-id',
} as const;

/** Keys whose contents are mirrored to the cloud. */
export const SYNCED_KEYS: readonly string[] = [
  STORAGE_KEYS.TRIVIA_PROGRESS,
  STORAGE_KEYS.VOCABULARY_PROGRESS,
  STORAGE_KEYS.USER_VOCABULARY,
  STORAGE_KEYS.STUDY_STATS,
  STORAGE_KEYS.INCORRECT_COUNTS,
];

/**
 * Where a write came from. Only 'local' writes (the user studying on this
 * device) are pushed to the cloud; 'remote' writes come from a cloud pull and
 * 'external' ones from another tab, which pushes for itself.
 */
export type WriteOrigin = 'local' | 'remote' | 'external';
type Listener = (key: string, origin: WriteOrigin) => void;

const listeners = new Set<Listener>();
const MISSING = Symbol('missing');
// Parsed values, so repeated reads return the same object (required by useSyncExternalStore)
const cache = new Map<string, unknown>();

export function subscribeToStorage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(key: string, origin: WriteOrigin) {
  listeners.forEach(listener => listener(key, origin));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null) cache.clear();
    else cache.delete(e.key);
    emit(e.key ?? '*', 'external');
  });
}

/**
 * Generic localStorage get with JSON parsing. The returned value is shared;
 * treat it as immutable.
 */
export function getFromStorage<T>(key: string, defaultValue: T): T {
  if (!cache.has(key)) {
    try {
      const item = localStorage.getItem(key);
      cache.set(key, item === null ? MISSING : JSON.parse(item));
    } catch (error) {
      console.error(`Error reading from localStorage key "${key}":`, error);
      return defaultValue;
    }
  }
  const value = cache.get(key);
  return value === MISSING ? defaultValue : (value as T);
}

/**
 * Generic localStorage set with JSON stringifying
 */
export function setToStorage<T>(key: string, value: T, origin: WriteOrigin = 'local'): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    cache.set(key, value);
    emit(key, origin);
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
    cache.set(key, MISSING);
    emit(key, 'remote');
  } catch (error) {
    console.error(`Error removing from localStorage key "${key}":`, error);
  }
}

/** YYYY-MM-DD in the user's local time zone. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateString(d);
}

// User-added vocabulary
export const EMPTY_VOCABULARY: UserVocabulary = { words: [], deletedIds: [], lastUpdated: '' };

export function getUserVocabulary(): UserVocabulary {
  return getFromStorage<UserVocabulary>(STORAGE_KEYS.USER_VOCABULARY, EMPTY_VOCABULARY);
}

export function setUserVocabulary(vocabulary: UserVocabulary): void {
  setToStorage(STORAGE_KEYS.USER_VOCABULARY, vocabulary);
}

export function addUserWord(word: VocabularyCard): void {
  const current = getUserVocabulary();
  setUserVocabulary({
    ...current,
    words: [...current.words, word],
    lastUpdated: new Date().toISOString(),
  });
}

export function updateUserWord(wordId: string, updates: Partial<VocabularyCard>): void {
  const current = getUserVocabulary();
  if (!current.words.some(w => w.id === wordId)) return;
  setUserVocabulary({
    ...current,
    words: current.words.map(w => (w.id === wordId ? { ...w, ...updates } : w)),
    lastUpdated: new Date().toISOString(),
  });
}

export function deleteUserWord(wordId: string): void {
  const current = getUserVocabulary();
  setUserVocabulary({
    ...current,
    words: current.words.filter(w => w.id !== wordId),
    deletedIds: [...new Set([...(current.deletedIds ?? []), wordId])],
    lastUpdated: new Date().toISOString(),
  });
}

// Study statistics
export interface StudyStats {
  totalCardsReviewed: number;
  totalCorrect: number;
  totalIncorrect: number;
  lastStudyDate: string;
  streak: number;
}

export const EMPTY_STUDY_STATS: StudyStats = {
  totalCardsReviewed: 0,
  totalCorrect: 0,
  totalIncorrect: 0,
  lastStudyDate: '',
  streak: 0,
};

export function getStudyStats(): StudyStats {
  return getFromStorage<StudyStats>(STORAGE_KEYS.STUDY_STATS, EMPTY_STUDY_STATS);
}

/** The streak as of today: a streak whose last day was before yesterday has lapsed. */
export function currentStreak(stats: StudyStats): number {
  return stats.lastStudyDate === localDateString() || stats.lastStudyDate === yesterdayString()
    ? stats.streak
    : 0;
}

export function updateStudyStats(correct: number, incorrect: number): void {
  const stats = getStudyStats();
  const today = localDateString();

  let streak = stats.streak;
  if (stats.lastStudyDate === yesterdayString()) {
    streak += 1;
  } else if (stats.lastStudyDate !== today) {
    streak = 1;
  }

  setToStorage(STORAGE_KEYS.STUDY_STATS, {
    totalCardsReviewed: stats.totalCardsReviewed + correct + incorrect,
    totalCorrect: stats.totalCorrect + correct,
    totalIncorrect: stats.totalIncorrect + incorrect,
    lastStudyDate: today,
    streak,
  });
}

// Incorrect counts — tracks how many times each card has been rated "again" (0)
const EMPTY_COUNTS: Record<string, number> = {};

export function getIncorrectCounts(): Record<string, number> {
  return getFromStorage<Record<string, number>>(STORAGE_KEYS.INCORRECT_COUNTS, EMPTY_COUNTS);
}

export function incrementIncorrectCount(cardId: string): void {
  const counts = getIncorrectCounts();
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { ...counts, [cardId]: (counts[cardId] ?? 0) + 1 });
}

/** Cards missed more than once. */
export function troubleCardIdsFrom(counts: Record<string, number>): Set<string> {
  return new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([id]) => id));
}

// Ownership: which signed-in user the local data belongs to
export function getStorageOwner(): string | null {
  return getFromStorage<string | null>(STORAGE_KEYS.OWNER, null);
}

export function setStorageOwner(userId: string): void {
  setToStorage(STORAGE_KEYS.OWNER, userId, 'remote');
}

// Clear all data
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    removeFromStorage(key);
  });
}

/** Drop cached values so the next read goes to localStorage (for tests). */
export function resetStorageCache(): void {
  cache.clear();
}
