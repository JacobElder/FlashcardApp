import { lookupWord } from './dictionary';
import { getUserVocabulary, markPendingNotFound, resolvePendingWord, subscribeToStorage, STORAGE_KEYS } from './storage';

let running = false;
let rerun = false;
/** Words whose lookup just failed, and when they may be tried again. */
const retryAt = new Map<string, number>();
const RETRY_DELAY_MS = 5 * 60_000;

/**
 * Look up every queued word and turn each one found into a card. Words the
 * dictionary lacks are marked not_found. A word whose lookup fails waits a few
 * minutes before it's retried, without holding up the words behind it.
 * Concurrent calls coalesce into one extra pass.
 */
export async function resolvePendingWords(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      const now = Date.now();
      const queued = (getUserVocabulary().pending ?? [])
        .filter(p => p.status === 'queued' && (retryAt.get(p.id) ?? 0) <= now);
      for (const item of queued) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        let entry;
        try {
          entry = await lookupWord(item.word);
        } catch (error) {
          console.warn(`Definition lookup for "${item.word}" failed; will retry later.`, error);
          retryAt.set(item.id, Date.now() + RETRY_DELAY_MS);
          continue;
        }
        retryAt.delete(item.id);
        if (entry) resolvePendingWord(item.id, { word: item.word, ...entry });
        else markPendingNotFound(item.id);
      }
    } while (rerun);
  } finally {
    running = false;
  }
}

/**
 * Resolve queued words now, whenever the device comes back online, and
 * whenever the vocabulary changes (a new capture here or a cloud pull).
 */
export function startPendingWordResolver(): () => void {
  const run = () => void resolvePendingWords();
  const runNow = () => {
    // Failures while offline say nothing about the words themselves
    retryAt.clear();
    run();
  };
  run();
  window.addEventListener('online', runNow);
  const unsubscribe = subscribeToStorage((key) => {
    if (key !== STORAGE_KEYS.USER_VOCABULARY && key !== '*') return;
    if ((getUserVocabulary().pending ?? []).some(p => p.status === 'queued')) run();
  });
  return () => {
    window.removeEventListener('online', runNow);
    unsubscribe();
  };
}

/** Forget lookup failures (for tests). */
export function resetPendingWordRetries(): void {
  retryAt.clear();
}
