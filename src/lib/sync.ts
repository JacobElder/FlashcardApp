import { getSupabase } from './supabase';
import {
  STORAGE_KEYS,
  SYNCED_KEYS,
  EMPTY_STUDY_STATS,
  clearAllData,
  getFromStorage,
  getStorageOwner,
  setStorageOwner,
  setToStorage,
  subscribeToStorage,
  type StudyStats,
} from './storage';
import { mergeCounts, mergeProfiles, mergeStats, mergeVocabulary } from './merge';
import type { IRTProfile, UserVocabulary } from '../types';

/** Wait this long after the last local change before pushing, to batch a burst of writes. */
const PUSH_DEBOUNCE_MS = 2000;
/** Minimum gap between pulls triggered by returning to the tab. */
const FOCUS_PULL_INTERVAL_MS = 60_000;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

interface ProgressRow {
  trivia_profile: IRTProfile;
  vocabulary_profile: IRTProfile;
  study_stats: StudyStats;
  user_vocabulary: UserVocabulary;
  incorrect_counts: Record<string, number>;
}

interface LocalSnapshot {
  trivia: IRTProfile | undefined;
  vocabulary: IRTProfile | undefined;
  stats: StudyStats | undefined;
  userVocabulary: UserVocabulary | undefined;
  incorrectCounts: Record<string, number> | undefined;
}

let userId: string | null = null;
let dirty = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastPullAt = 0;
// Serializes pulls and pushes so a push never races a pull for the same row
let queue: Promise<void> = Promise.resolve();

// Replaced (never mutated) on change, so it can back useSyncExternalStore
let statusSnapshot: { status: SyncStatus; error: string | null } = { status: 'idle', error: null };
const statusListeners = new Set<() => void>();

function setStatus(status: SyncStatus, error: string | null = null) {
  if (status === statusSnapshot.status && error === statusSnapshot.error) return;
  statusSnapshot = { status, error };
  statusListeners.forEach(listener => listener());
}

export function getSyncStatus(): { status: SyncStatus; error: string | null } {
  return statusSnapshot;
}

export function subscribeToSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task);
  return queue;
}

function readLocal(): LocalSnapshot {
  return {
    trivia: getFromStorage<IRTProfile | undefined>(STORAGE_KEYS.TRIVIA_PROGRESS, undefined),
    vocabulary: getFromStorage<IRTProfile | undefined>(STORAGE_KEYS.VOCABULARY_PROGRESS, undefined),
    stats: getFromStorage<StudyStats | undefined>(STORAGE_KEYS.STUDY_STATS, undefined),
    userVocabulary: getFromStorage<UserVocabulary | undefined>(STORAGE_KEYS.USER_VOCABULARY, undefined),
    incorrectCounts: getFromStorage<Record<string, number> | undefined>(STORAGE_KEYS.INCORRECT_COUNTS, undefined),
  };
}

function writeIfChanged<T>(key: string, value: T) {
  const current = getFromStorage<T | undefined>(key, undefined);
  if (JSON.stringify(current) !== JSON.stringify(value)) {
    // 'remote' so the write isn't echoed back to the cloud as a new change
    setToStorage(key, value, 'remote');
  }
}

function toRow(local: LocalSnapshot): ProgressRow {
  return {
    trivia_profile: local.trivia ?? { ability: 0, cardHistory: {} },
    vocabulary_profile: local.vocabulary ?? { ability: 0, cardHistory: {} },
    study_stats: local.stats ?? EMPTY_STUDY_STATS,
    user_vocabulary: local.userVocabulary ?? { words: [], deletedIds: [], lastUpdated: '' },
    incorrect_counts: local.incorrectCounts ?? {},
  };
}

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}

async function push(): Promise<void> {
  const uid = userId;
  if (!uid) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    dirty = true;
    setStatus('offline');
    return;
  }

  setStatus('syncing');
  const { error } = await getSupabase()
    .from('user_progress')
    .upsert({ user_id: uid, ...toRow(readLocal()), updated_at: new Date().toISOString() });

  if (error) {
    dirty = true; // retried on the next change, focus, or reconnect
    console.error('Cloud sync push failed:', error);
    setStatus('error', describe(error));
  } else {
    setStatus('synced');
  }
}

async function pull(): Promise<void> {
  const uid = userId;
  if (!uid) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline');
    return;
  }

  setStatus('syncing');
  lastPullAt = Date.now();
  const { data, error } = await getSupabase()
    .from('user_progress')
    .select('trivia_profile, vocabulary_profile, study_stats, user_vocabulary, incorrect_counts')
    .eq('user_id', uid)
    .maybeSingle<ProgressRow>();

  if (error) {
    console.error('Cloud sync pull failed:', error);
    setStatus('error', describe(error));
    return;
  }
  if (uid !== userId) return; // signed out while the request was in flight

  const local = readLocal();
  const merged: LocalSnapshot = {
    trivia: mergeProfiles(local.trivia, data?.trivia_profile),
    vocabulary: mergeProfiles(local.vocabulary, data?.vocabulary_profile),
    stats: mergeStats(local.stats, data?.study_stats),
    userVocabulary: mergeVocabulary(local.userVocabulary, data?.user_vocabulary),
    incorrectCounts: mergeCounts(local.incorrectCounts, data?.incorrect_counts),
  };

  writeIfChanged(STORAGE_KEYS.TRIVIA_PROGRESS, merged.trivia);
  writeIfChanged(STORAGE_KEYS.VOCABULARY_PROGRESS, merged.vocabulary);
  writeIfChanged(STORAGE_KEYS.STUDY_STATS, merged.stats);
  writeIfChanged(STORAGE_KEYS.USER_VOCABULARY, merged.userVocabulary);
  writeIfChanged(STORAGE_KEYS.INCORRECT_COUNTS, merged.incorrectCounts);

  // If this device had anything the cloud lacked, send the merged result back
  const mergedRow = toRow(merged);
  const cloudIsCurrent = data !== null &&
    (Object.keys(mergedRow) as (keyof ProgressRow)[]).every(
      column => JSON.stringify(mergedRow[column]) === JSON.stringify(data[column])
    );
  if (cloudIsCurrent && !dirty) {
    setStatus('synced');
  } else {
    dirty = false;
    await push();
  }
}

/**
 * Begin syncing for a signed-in user: claims local data for them (clearing it
 * if it belonged to someone else), merges with the cloud copy, and pushes
 * subsequent local changes.
 */
export function startSync(uid: string): Promise<void> {
  if (userId === uid) return queue;
  claimLocalData(uid);
  userId = uid;
  return enqueue(pull);
}

/**
 * Mark local data as belonging to `uid`, first clearing it if it belonged to a
 * different account. Synchronous, so it can run before any page reads storage.
 */
export function claimLocalData(uid: string): void {
  const owner = getStorageOwner();
  if (owner && owner !== uid) clearAllData();
  if (owner !== uid) setStorageOwner(uid);
}

/** True if local changes haven't reached the cloud yet. */
export function hasUnsyncedChanges(): boolean {
  return dirty || statusSnapshot.status === 'error' || statusSnapshot.status === 'offline';
}

/** Push any pending changes now (e.g. before signing out or when the page is hidden). */
export function flushPush(): Promise<void> {
  clearTimeout(pushTimer);
  if (!dirty) return queue;
  dirty = false;
  return enqueue(push);
}

/** Stop syncing and forget the user (call after sign-out). */
export function stopSync(): void {
  clearTimeout(pushTimer);
  userId = null;
  dirty = false;
  setStatus('idle');
}

subscribeToStorage((key, origin) => {
  if (origin !== 'local' || !userId || !SYNCED_KEYS.includes(key)) return;
  dirty = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flushPush(), PUSH_DEBOUNCE_MS);
});

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!userId) return;
    if (document.visibilityState === 'hidden') {
      void flushPush();
    } else if (Date.now() - lastPullAt > FOCUS_PULL_INTERVAL_MS) {
      // Pick up progress made on another device
      void enqueue(pull);
    }
  });
  window.addEventListener('pagehide', () => void flushPush());
  window.addEventListener('online', () => {
    if (userId) void enqueue(dirty ? async () => { dirty = false; await push(); } : pull);
  });
}
