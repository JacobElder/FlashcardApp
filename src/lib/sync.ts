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

interface RemoteRow extends Partial<ProgressRow> {
  updated_at?: string;
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
// Serializes syncs so two never race for the same row
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

const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;

/** How many times to re-merge when the cloud row changes between our read and write. */
const MAX_SYNC_ATTEMPTS = 3;

type SyncAttempt = 'done' | 'conflict' | 'stale';

/** Merge the cloud row into local storage, then upload the result if the cloud lacks anything. */
async function syncOnce(uid: string): Promise<SyncAttempt> {
  const table = () => getSupabase().from('user_progress');
  const { data, error } = await table()
    .select('trivia_profile, vocabulary_profile, study_stats, user_vocabulary, incorrect_counts, updated_at')
    .eq('user_id', uid)
    .maybeSingle<RemoteRow>();
  if (error) throw error;
  if (uid !== userId) return 'stale'; // signed out while the request was in flight

  // Read local data after the download, with no await in between, so no local write is missed
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

  // The merge already contains everything local, so if it equals the cloud there's nothing to send
  const mergedRow = toRow(merged);
  const cloudIsCurrent = data != null &&
    (Object.keys(mergedRow) as (keyof ProgressRow)[]).every(
      column => JSON.stringify(mergedRow[column]) === JSON.stringify(data[column])
    );
  if (cloudIsCurrent) return 'done';

  const updatedAt = new Date().toISOString();
  if (data?.updated_at) {
    // Compare-and-swap: only overwrite the row we merged with. If another
    // device or the CLI wrote in the meantime, nothing matches and we re-merge.
    const { data: written, error: writeError } = await table()
      .update({ ...mergedRow, updated_at: updatedAt })
      .eq('user_id', uid)
      .eq('updated_at', data.updated_at)
      .select('user_id');
    if (writeError) throw writeError;
    if (!written || written.length === 0) return 'conflict';
  } else if (data) {
    const { error: writeError } = await table().upsert({ user_id: uid, ...mergedRow, updated_at: updatedAt });
    if (writeError) throw writeError;
  } else {
    const { error: writeError } = await table().insert({ user_id: uid, ...mergedRow, updated_at: updatedAt });
    // Another device created the row first: merge with it instead
    if (writeError?.code === '23505') return 'conflict';
    if (writeError) throw writeError;
  }
  return 'done';
}

/**
 * Bring this device and the cloud in line. Every upload is preceded by a
 * download and merge, so a device that failed to download, was offline, or
 * sat open for hours can never overwrite progress it hasn't seen.
 */
async function sync(): Promise<void> {
  const uid = userId;
  if (!uid) return;
  if (isOffline()) {
    setStatus('offline');
    return;
  }

  // Changes made from here on are picked up by the next sync
  dirty = false;
  setStatus('syncing');
  lastPullAt = Date.now();
  try {
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      const result = await syncOnce(uid);
      if (result === 'stale') return;
      if (result === 'done') {
        setStatus('synced');
        return;
      }
    }
    throw new Error('Cloud data kept changing during sync');
  } catch (error) {
    if (uid !== userId) return;
    dirty = true; // retried on the next change, focus, or reconnect
    console.error('Cloud sync failed:', error);
    setStatus('error', describe(error));
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
  return enqueue(sync);
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

/** True if local changes may not have reached the cloud yet. */
export function hasUnsyncedChanges(): boolean {
  const { status } = statusSnapshot;
  return dirty || status === 'error' || status === 'offline' || status === 'syncing';
}

/** Push any pending changes now (e.g. before signing out or when the page is hidden). */
export function flushPush(): Promise<void> {
  clearTimeout(pushTimer);
  if (!dirty) return queue;
  return enqueue(sync);
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
      void enqueue(sync);
    }
  });
  window.addEventListener('pagehide', () => void flushPush());
  window.addEventListener('online', () => {
    // Always download first: a device that studied offline must not overwrite the cloud
    if (userId) void enqueue(sync);
  });
}
