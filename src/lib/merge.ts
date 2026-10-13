import type { IRTCardHistory, IRTProfile, UserVocabulary } from '../types';
import { EMPTY_STUDY_STATS, type StudyStats } from './storage';

/** Ability points kept for the analytics chart; older points are dropped. */
export const MAX_ABILITY_HISTORY = 500;

const isEmptyObject = (value: object | null | undefined) =>
  !value || Object.keys(value).length === 0;

function lastActivity(profile: IRTProfile): string {
  const history = profile.abilityHistory ?? [];
  return profile.updatedAt ?? history[history.length - 1]?.date ?? '';
}

function newerHistory(a: IRTCardHistory, b: IRTCardHistory): IRTCardHistory {
  return (b.lastAnsweredDate ?? '') > (a.lastAnsweredDate ?? '') ? b : a;
}

/**
 * Merge two copies of a deck profile (e.g. this device and the cloud).
 * Each card keeps whichever copy was answered most recently, so studying on
 * two devices never discards answers from either.
 */
export function mergeProfiles(local: IRTProfile | undefined, remote: IRTProfile | undefined): IRTProfile {
  if (!remote || isEmptyObject(remote)) return local ?? { ability: 0, cardHistory: {} };
  if (!local || isEmptyObject(local)) return remote;

  const cardHistory: Record<string, IRTCardHistory> = { ...local.cardHistory };
  for (const [key, entry] of Object.entries(remote.cardHistory ?? {})) {
    cardHistory[key] = cardHistory[key] ? newerHistory(cardHistory[key], entry) : entry;
  }

  const seen = new Set<string>();
  const abilityHistory = [...(local.abilityHistory ?? []), ...(remote.abilityHistory ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(point => !seen.has(point.date) && seen.add(point.date))
    .slice(-MAX_ABILITY_HISTORY);

  const newer = lastActivity(remote) > lastActivity(local) ? remote : local;
  return {
    ability: newer.ability,
    abilityInfo: newer.abilityInfo,
    cardHistory,
    abilityHistory,
    updatedAt: newer.updatedAt ?? local.updatedAt ?? remote.updatedAt,
  };
}

export function mergeVocabulary(
  local: UserVocabulary | undefined,
  remote: UserVocabulary | undefined
): UserVocabulary {
  if (!remote || isEmptyObject(remote)) return local ?? { words: [], deletedIds: [], lastUpdated: '' };
  if (!local || isEmptyObject(local)) return remote;

  const deletedIds = [...new Set([...(local.deletedIds ?? []), ...(remote.deletedIds ?? [])])];
  const deleted = new Set(deletedIds);
  // Words present on both sides take the copy from the most recently edited list
  const [older, newer] = (remote.lastUpdated ?? '') > (local.lastUpdated ?? '') ? [local, remote] : [remote, local];
  const byId = new Map(older.words.map(w => [w.id, w]));
  for (const word of newer.words) byId.set(word.id, word);

  return {
    words: [...byId.values()].filter(w => !deleted.has(w.id)),
    deletedIds,
    lastUpdated: newer.lastUpdated,
  };
}

export function mergeCounts(
  local: Record<string, number> | undefined,
  remote: Record<string, number> | undefined
): Record<string, number> {
  const merged: Record<string, number> = { ...(local ?? {}) };
  for (const [id, count] of Object.entries(remote ?? {})) {
    merged[id] = Math.max(merged[id] ?? 0, count);
  }
  return merged;
}

export function mergeStats(local: StudyStats | undefined, remote: StudyStats | undefined): StudyStats {
  if (!remote || isEmptyObject(remote)) return local ?? EMPTY_STUDY_STATS;
  if (!local || isEmptyObject(local)) return remote;

  const latest = remote.lastStudyDate > local.lastStudyDate ? remote : local;
  return {
    totalCardsReviewed: Math.max(local.totalCardsReviewed, remote.totalCardsReviewed),
    totalCorrect: Math.max(local.totalCorrect, remote.totalCorrect),
    totalIncorrect: Math.max(local.totalIncorrect, remote.totalIncorrect),
    lastStudyDate: latest.lastStudyDate,
    streak: remote.lastStudyDate === local.lastStudyDate
      ? Math.max(local.streak, remote.streak)
      : latest.streak,
  };
}
