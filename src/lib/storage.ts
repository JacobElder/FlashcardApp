import type { IRTCardHistory, IRTProfile, NewWordFormData, PendingWord, UserVocabulary, VocabularyCard } from '../types';

export const STORAGE_KEYS = {
  TRIVIA_PROGRESS: 'nyc-trivia-progress',
  VOCABULARY_PROGRESS: 'nyc-vocabulary-progress',
  DATA_SCIENCE_PROGRESS: 'nyc-data-science-progress',
  USER_VOCABULARY: 'nyc-user-vocabulary',
  USER_FACTS: 'nyc-user-facts',
  STUDY_STATS: 'nyc-study-stats',
  INCORRECT_COUNTS: 'nyc-incorrect-counts',
  /** INCORRECT_COUNTS split by device: { deviceId: { cardId: n } }. */
  INCORRECT_COUNTS_BY_DEVICE: 'nyc-incorrect-counts-by-device',
  /** Supabase user id the local data belongs to. */
  OWNER: 'nyc-owner-user-id',
} as const;

/** Keys whose contents are mirrored to the cloud. */
export const SYNCED_KEYS: readonly string[] = [
  STORAGE_KEYS.TRIVIA_PROGRESS,
  STORAGE_KEYS.VOCABULARY_PROGRESS,
  STORAGE_KEYS.DATA_SCIENCE_PROGRESS,
  STORAGE_KEYS.USER_VOCABULARY,
  STORAGE_KEYS.USER_FACTS,
  STORAGE_KEYS.STUDY_STATS,
  STORAGE_KEYS.INCORRECT_COUNTS,
  STORAGE_KEYS.INCORRECT_COUNTS_BY_DEVICE,
];

/** This browser's id for per-device counters. Not cleared on sign-out: it identifies the device, not the user. */
export const DEVICE_ID_KEY = 'nyc-device-id';

export function getDeviceId(): string {
  const existing = getFromStorage<string | null>(DEVICE_ID_KEY, null);
  if (typeof existing === 'string' && existing) return existing;
  const id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  setToStorage(DEVICE_ID_KEY, id, 'remote');
  return id;
}

/**
 * Where a write came from. Only 'local' writes (the user studying on this
 * device) are pushed to the cloud; 'remote' writes come from a cloud pull and
 * 'external' ones from another tab, which pushes for itself.
 */
export type WriteOrigin = 'local' | 'remote' | 'external';
type Listener = (key: string, origin: WriteOrigin) => void;

const listeners = new Set<Listener>();
const errorListeners = new Set<() => void>();
let writeFailed = false;
const MISSING = Symbol('missing');
// Parsed values, so repeated reads return the same object (required by useSyncExternalStore)
const cache = new Map<string, unknown>();

export function subscribeToStorage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once a write to localStorage has failed (usually because it's full). */
export function hasStorageWriteFailed(): boolean {
  return writeFailed;
}

export function subscribeToStorageErrors(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

function reportWriteFailure(key: string, error: unknown) {
  console.error(`Error writing to localStorage key "${key}":`, error);
  if (writeFailed) return;
  writeFailed = true;
  errorListeners.forEach(listener => listener());
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
  } catch (error) {
    // Keep the value for this tab (and the cloud sync, which reads the cache)
    // rather than silently dropping the user's progress
    reportWriteFailure(key, error);
  }
  cache.set(key, value);
  emit(key, origin);
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
  cache.set(key, MISSING);
  emit(key, 'remote');
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
  const now = new Date().toISOString();
  setUserVocabulary({
    ...current,
    words: [...current.words, { ...word, updatedAt: now }],
    lastUpdated: now,
  });
}

export function updateUserWord(wordId: string, updates: Partial<VocabularyCard>): void {
  const current = getUserVocabulary();
  if (!current.words.some(w => w.id === wordId)) return;
  const now = new Date().toISOString();
  setUserVocabulary({
    ...current,
    words: current.words.map(w => (w.id === wordId ? { ...w, ...updates, updatedAt: now } : w)),
    lastUpdated: now,
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

/** Card fields for a user word. */
export function toCardFields(data: NewWordFormData) {
  return {
    word: data.word,
    definition: data.definition,
    partOfSpeech: data.partOfSpeech,
    example: data.example,
    front: data.word,
    back: data.definition + (data.example ? `\n\nExample: "${data.example}"` : ''),
  };
}

export function generateWordId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Queue words to be defined later. Blank entries and words already in the
 * deck or queue (case-insensitive) are skipped. Returns the words queued.
 */
export function queuePendingWords(words: string[], deckWords: Iterable<string>): string[] {
  const current = getUserVocabulary();
  const pending = current.pending ?? [];
  const known = new Set([...deckWords, ...pending.map(p => p.word)].map(w => w.trim().toLowerCase()));
  const added: PendingWord[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word || known.has(word.toLowerCase())) continue;
    known.add(word.toLowerCase());
    added.push({ id: generateWordId(), word, addedAt: new Date().toISOString(), status: 'queued' });
  }
  if (added.length > 0) {
    setUserVocabulary({ ...current, pending: [...pending, ...added], lastUpdated: new Date().toISOString() });
  }
  return added.map(p => p.word);
}

/** Turn a pending word into a card (keeping its id). False if it's no longer pending. */
export function resolvePendingWord(id: string, data: NewWordFormData): boolean {
  const current = getUserVocabulary();
  const pending = current.pending ?? [];
  if (!pending.some(p => p.id === id)) return false;
  const now = new Date().toISOString();
  setUserVocabulary({
    ...current,
    words: [...current.words, { id, type: 'vocabulary', isUserAdded: true, ...toCardFields(data), updatedAt: now }],
    pending: pending.filter(p => p.id !== id),
    lastUpdated: now,
  });
  return true;
}

export function markPendingNotFound(id: string): void {
  const current = getUserVocabulary();
  const pending = current.pending ?? [];
  if (!pending.some(p => p.id === id && p.status !== 'not_found')) return;
  setUserVocabulary({
    ...current,
    pending: pending.map(p => (p.id === id ? { ...p, status: 'not_found' as const } : p)),
    lastUpdated: new Date().toISOString(),
  });
}

export function removePendingWord(id: string): void {
  const current = getUserVocabulary();
  setUserVocabulary({
    ...current,
    pending: (current.pending ?? []).filter(p => p.id !== id),
    deletedIds: [...new Set([...(current.deletedIds ?? []), id])],
    lastUpdated: new Date().toISOString(),
  });
}

// Study statistics
/** One device's share of the study totals (zeros omitted). */
export interface DeviceStudyTotals {
  reviewed?: number;
  correct?: number;
  incorrect?: number;
}

export interface StudyStats {
  totalCardsReviewed: number;
  totalCorrect: number;
  totalIncorrect: number;
  lastStudyDate: string;
  streak: number;
  /**
   * The totals split by device, so a sync adds up study on different devices.
   * Totals not covered here (from before this existed) are "legacy".
   */
  devices?: Record<string, DeviceStudyTotals>;
  /**
   * When study progress was last reset (ISO). Sync discards progress from a
   * copy with an older reset point instead of merging it back in.
   */
  progressResetAt?: string;
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

  const device = getDeviceId();
  const mine = stats.devices?.[device] ?? {};
  setToStorage<StudyStats>(STORAGE_KEYS.STUDY_STATS, {
    devices: {
      ...stats.devices,
      [device]: {
        reviewed: (mine.reviewed ?? 0) + correct + incorrect,
        correct: (mine.correct ?? 0) + correct,
        incorrect: (mine.incorrect ?? 0) + incorrect,
      },
    },
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

export type CountsByDevice = Record<string, Record<string, number>>;
const EMPTY_BY_DEVICE: CountsByDevice = {};

export function getIncorrectCountsByDevice(): CountsByDevice {
  return getFromStorage<CountsByDevice>(STORAGE_KEYS.INCORRECT_COUNTS_BY_DEVICE, EMPTY_BY_DEVICE);
}

export function incrementIncorrectCount(cardId: string): void {
  const device = getDeviceId();
  const byDevice = getIncorrectCountsByDevice();
  const mine = byDevice[device] ?? {};
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS_BY_DEVICE, { ...byDevice, [device]: { ...mine, [cardId]: (mine[cardId] ?? 0) + 1 } });
  const counts = getIncorrectCounts();
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { ...counts, [cardId]: (counts[cardId] ?? 0) + 1 });
}

/** Correct answers in a row that take a card off the trouble list. */
export const TROUBLE_GRADUATION_STREAK = 3;

/**
 * Cards missed more than once that haven't since been answered correctly
 * TROUBLE_GRADUATION_STREAK times in a row. The streak lives in the card's
 * history rather than lowering the miss count, because miss counts are
 * grow-only per-device counters that a sync adds up, so a decrease would be undone.
 */
export function troubleCardIdsFrom(
  counts: Record<string, number>,
  cardHistory: Record<string, IRTCardHistory> = {}
): Set<string> {
  return new Set(
    Object.entries(counts)
      .filter(([id, n]) => n > 1 && (cardHistory[id]?.correctStreak ?? 0) < TROUBLE_GRADUATION_STREAK)
      .map(([id]) => id)
  );
}

// Ownership: which signed-in user the local data belongs to
export function getStorageOwner(): string | null {
  return getFromStorage<string | null>(STORAGE_KEYS.OWNER, null);
}

export function setStorageOwner(userId: string): void {
  setToStorage(STORAGE_KEYS.OWNER, userId, 'remote');
}

/** Where an account's local data is kept after a different account signs in on this device. */
export const backupKey = (userId: string) => `nyc-backup-${userId}`;

/** Copy every data key (as stored) into `userId`'s backup, replacing an older one. */
export function backupLocalData(userId: string): void {
  const data: Record<string, unknown> = {};
  for (const key of Object.values(STORAGE_KEYS)) {
    if (key === STORAGE_KEYS.OWNER) continue;
    const value = getFromStorage<unknown>(key, undefined);
    if (value !== undefined) data[key] = value;
  }
  if (Object.keys(data).length === 0) return;
  setToStorage(backupKey(userId), { savedAt: new Date().toISOString(), data }, 'remote');
}

/** Put back the data saved by backupLocalData and drop the backup. False if there was none. */
export function restoreLocalBackup(userId: string): boolean {
  const backup = getFromStorage<{ data?: Record<string, unknown> } | null>(backupKey(userId), null);
  if (!backup || typeof backup.data !== 'object' || backup.data === null) return false;
  const known = new Set<string>(Object.values(STORAGE_KEYS));
  for (const [key, value] of Object.entries(backup.data)) {
    if (known.has(key) && key !== STORAGE_KEYS.OWNER) setToStorage(key, value, 'remote');
  }
  removeFromStorage(backupKey(userId));
  return true;
}

/**
 * Start every deck over: card schedules, ability, stats, streak and miss
 * counts. Words and facts the user added are kept. Writes are 'local' so they
 * sync, and the reset point makes sync drop older progress on other devices
 * and in the cloud rather than merging it back.
 */
export function resetStudyProgress(now: Date = new Date()): void {
  const empty: IRTProfile = { ability: 0, cardHistory: {} };
  setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, empty);
  setToStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, empty);
  setToStorage(STORAGE_KEYS.DATA_SCIENCE_PROGRESS, empty);
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, {});
  setToStorage(STORAGE_KEYS.INCORRECT_COUNTS_BY_DEVICE, {});
  setToStorage<StudyStats>(STORAGE_KEYS.STUDY_STATS, { ...EMPTY_STUDY_STATS, progressResetAt: now.toISOString() });
}

/** Clear this account's data keys (backups of other accounts are kept). */
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    removeFromStorage(key);
  });
}

/** Drop cached values so the next read goes to localStorage (for tests). */
export function resetStorageCache(): void {
  cache.clear();
  writeFailed = false;
}
