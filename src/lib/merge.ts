import type { IRTCardHistory, IRTProfile, PendingWord, UserVocabulary, VocabularyCard } from '../types';
import { EMPTY_STUDY_STATS, type StudyStats } from './storage';

/** Ability points kept for the analytics chart; older points are dropped. */
export const MAX_ABILITY_HISTORY = 500;

// Cloud rows can be partial or saved by an older version, so every field is checked before use
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isEmpty = (value: unknown) => !isRecord(value) || Object.keys(value).length === 0;
const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function normalizeProfile(profile: IRTProfile): IRTProfile {
  const cardHistory = isRecord(profile.cardHistory)
    ? Object.fromEntries(Object.entries(profile.cardHistory).filter(([, h]) => isRecord(h)))
    : {};
  return {
    ...profile,
    ability: finite(profile.ability),
    abilityInfo: profile.abilityInfo === undefined ? undefined : finite(profile.abilityInfo, 1),
    cardHistory: cardHistory as Record<string, IRTCardHistory>,
    abilityHistory: profile.abilityHistory === undefined
      ? undefined
      : list<{ date: string; ability: number }>(profile.abilityHistory)
          .filter(point => isRecord(point) && typeof point.date === 'string' && Number.isFinite(point.ability)),
  };
}

function lastActivity(profile: IRTProfile): string {
  const history = profile.abilityHistory ?? [];
  return text(profile.updatedAt) || text(history[history.length - 1]?.date);
}

function newerHistory(a: IRTCardHistory, b: IRTCardHistory): IRTCardHistory {
  return text(b.lastAnsweredDate) > text(a.lastAnsweredDate) ? b : a;
}

/**
 * Merge two copies of a deck profile (e.g. this device and the cloud).
 * Each card keeps whichever copy was answered most recently, so studying on
 * two devices never discards answers from either.
 */
export function mergeProfiles(local: IRTProfile | undefined, remote: IRTProfile | undefined): IRTProfile {
  if (isEmpty(remote)) return isEmpty(local) ? { ability: 0, cardHistory: {} } : normalizeProfile(local!);
  if (isEmpty(local)) return normalizeProfile(remote!);
  const l = normalizeProfile(local!);
  const r = normalizeProfile(remote!);

  const cardHistory: Record<string, IRTCardHistory> = { ...l.cardHistory };
  for (const [key, entry] of Object.entries(r.cardHistory)) {
    cardHistory[key] = cardHistory[key] ? newerHistory(cardHistory[key], entry) : entry;
  }

  const seen = new Set<string>();
  // Left out when neither side has one, so merging identical copies changes nothing
  const abilityHistory = l.abilityHistory || r.abilityHistory
    ? [...(l.abilityHistory ?? []), ...(r.abilityHistory ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter(point => !seen.has(point.date) && seen.add(point.date))
        .slice(-MAX_ABILITY_HISTORY)
    : undefined;

  const newer = lastActivity(r) > lastActivity(l) ? r : l;
  return {
    ability: newer.ability,
    abilityInfo: newer.abilityInfo,
    cardHistory,
    abilityHistory,
    updatedAt: newer.updatedAt ?? l.updatedAt ?? r.updatedAt,
  };
}

const normalizeWord = (word: unknown) => text(word).trim().toLowerCase();

function normalizeVocabulary(vocab: UserVocabulary): Required<UserVocabulary> {
  return {
    words: list<VocabularyCard>(vocab.words).filter(w => isRecord(w) && typeof w.id === 'string'),
    pending: list<PendingWord>(vocab.pending).filter(p => isRecord(p) && typeof p.id === 'string'),
    deletedIds: list<unknown>(vocab.deletedIds).filter((id): id is string => typeof id === 'string'),
    lastUpdated: text(vocab.lastUpdated),
  };
}

/** Lower sorts first; used to pick the same survivor on every device. */
const byStamp = <T extends { id: string }>(stamp: (item: T) => string) =>
  (a: T, b: T) => stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id);

/**
 * Merge two copies of the user's own vocabulary. Each word keeps its most
 * recently edited copy (falling back to the list's edit time for words saved
 * before per-word times existed). Deletions win, and the same word captured
 * on two devices collapses to one entry.
 */
export function mergeVocabulary(
  local: UserVocabulary | undefined,
  remote: UserVocabulary | undefined
): UserVocabulary {
  if (isEmpty(remote)) {
    return isEmpty(local) ? { words: [], deletedIds: [], lastUpdated: '' } : normalizeVocabulary(local!);
  }
  if (isEmpty(local)) return normalizeVocabulary(remote!);
  const l = normalizeVocabulary(local!);
  const r = normalizeVocabulary(remote!);

  const deletedIds = [...new Set([...l.deletedIds, ...r.deletedIds])];
  const deleted = new Set(deletedIds);
  const remoteIsNewer = r.lastUpdated > l.lastUpdated;
  const [older, newer] = remoteIsNewer ? [l, r] : [r, l];

  const wordStamp = (word: VocabularyCard, owner: Required<UserVocabulary>) =>
    text(word.updatedAt) || owner.lastUpdated;
  const byId = new Map(older.words.map(w => [w.id, w]));
  for (const word of newer.words) {
    const other = byId.get(word.id);
    // Ties go to the more recently edited list, as before per-word times existed
    if (!other || wordStamp(word, newer) >= wordStamp(other, older)) byId.set(word.id, word);
  }

  // A word added on two devices has two ids; keep one, the same one everywhere
  const byWord = new Map<string, VocabularyCard>();
  const firstCreated = byStamp<VocabularyCard>(w => w.id);
  for (const word of [...byId.values()].filter(w => !deleted.has(w.id)).sort(firstCreated)) {
    const key = normalizeWord(word.word);
    if (!byWord.has(key)) byWord.set(key, word);
  }
  const keptIds = new Set([...byWord.values()].map(w => w.id));
  const words = [...byId.values()].filter(w => keptIds.has(w.id));

  // A pending word that became a card (same id or same word) or was deleted on either side is done
  const resolved = new Set([...deleted, ...byId.keys()]);
  const pendingById = new Map(older.pending.map(p => [p.id, p]));
  for (const item of newer.pending) pendingById.set(item.id, item);
  const pendingByWord = new Map<string, PendingWord>();
  for (const item of [...pendingById.values()].sort(byStamp<PendingWord>(p => text(p.addedAt)))) {
    const key = normalizeWord(item.word);
    if (resolved.has(item.id) || byWord.has(key) || pendingByWord.has(key)) continue;
    pendingByWord.set(key, item);
  }
  const keptPending = new Set(pendingByWord.values());

  const pending = [...pendingById.values()].filter(p => keptPending.has(p));
  return {
    words,
    // Left out when neither side has a queue, so merging identical copies changes nothing
    ...(local!.pending || remote!.pending ? { pending } : {}),
    deletedIds,
    lastUpdated: newer.lastUpdated,
  };
}

export function mergeCounts(
  local: Record<string, number> | undefined,
  remote: Record<string, number> | undefined
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const source of [local, remote]) {
    if (!isRecord(source)) continue;
    for (const [id, count] of Object.entries(source)) {
      if (Number.isFinite(count)) merged[id] = Math.max(merged[id] ?? 0, count as number);
    }
  }
  return merged;
}

function normalizeStats(stats: StudyStats): StudyStats {
  return {
    totalCardsReviewed: finite(stats.totalCardsReviewed),
    totalCorrect: finite(stats.totalCorrect),
    totalIncorrect: finite(stats.totalIncorrect),
    lastStudyDate: text(stats.lastStudyDate),
    streak: finite(stats.streak),
  };
}

export function mergeStats(local: StudyStats | undefined, remote: StudyStats | undefined): StudyStats {
  if (isEmpty(remote)) return isEmpty(local) ? EMPTY_STUDY_STATS : normalizeStats(local!);
  if (isEmpty(local)) return normalizeStats(remote!);
  const l = normalizeStats(local!);
  const r = normalizeStats(remote!);

  const latest = r.lastStudyDate > l.lastStudyDate ? r : l;
  return {
    totalCardsReviewed: Math.max(l.totalCardsReviewed, r.totalCardsReviewed),
    totalCorrect: Math.max(l.totalCorrect, r.totalCorrect),
    totalIncorrect: Math.max(l.totalIncorrect, r.totalIncorrect),
    lastStudyDate: latest.lastStudyDate,
    streak: r.lastStudyDate === l.lastStudyDate ? Math.max(l.streak, r.streak) : latest.streak,
  };
}
