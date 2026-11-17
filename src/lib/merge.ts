import type { DeviceCardCounts, IRTCardHistory, IRTProfile, PendingWord, UserVocabulary, VocabularyCard } from '../types';
import { EMPTY_STUDY_STATS, type CountsByDevice, type DeviceStudyTotals, type StudyStats } from './storage';
import { initialAbilityInfo } from './irt';

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

// ---- Per-device grow-only counters ----------------------------------------
//
// A count recorded on several devices is kept as its total plus a breakdown
// { deviceId: n }. Each device only ever increases its own entry, so merging
// two copies takes the larger value per device and adds them up. The part of
// a total its breakdown doesn't explain is "legacy" (counted before devices
// were tracked); legacy parts are merged with max, as all counts used to be.
//
// A copy with no breakdown at all was written by an older app version (which
// drops unknown fields) or predates tracking; its legacy part is what's left
// after the other copy's device entries, so a stale client re-uploading a
// total that already includes them doesn't double count.

type Buckets = Record<string, number>;

const sum = (buckets: Buckets | undefined) =>
  Object.values(buckets ?? {}).reduce((total, n) => total + n, 0);

/** Positive finite entries of a breakdown; undefined when there is no breakdown at all. */
function cleanBuckets(value: unknown): Buckets | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0
  ));
}

export interface MergedCounter {
  total: number;
  /** Per-device entries (possibly empty); undefined when neither side had a breakdown. */
  buckets: Buckets | undefined;
}

/**
 * Merge one grow-only counter. `undefined` buckets mean that copy has no
 * breakdown (see above); `{}` means it has one with no device entries yet.
 */
export function mergeCounter(
  localTotal: number,
  localBuckets: Buckets | undefined,
  remoteTotal: number,
  remoteBuckets: Buckets | undefined
): MergedCounter {
  const l = cleanBuckets(localBuckets);
  const r = cleanBuckets(remoteBuckets);
  const legacy = Math.max(
    0,
    finite(localTotal) - sum(l ?? r),
    finite(remoteTotal) - sum(r ?? l)
  );
  if (!l && !r) return { total: legacy, buckets: undefined };
  const merged: Buckets = { ...l };
  for (const [device, n] of Object.entries(r ?? {})) merged[device] = Math.max(merged[device] ?? 0, n);
  return { total: legacy + sum(merged), buckets: merged };
}

type Breakdown<F extends string> = Record<string, Partial<Record<F, number>>>;

/** Field `field` of each device entry, as { device: n }; undefined without a breakdown. */
function column<F extends string>(byDevice: unknown, field: F): Buckets | undefined {
  if (!isRecord(byDevice) || Object.keys(byDevice).length === 0) return undefined;
  const out: Buckets = {};
  for (const [device, entry] of Object.entries(byDevice)) {
    const n = isRecord(entry) ? entry[field] : undefined;
    if (typeof n === 'number') out[device] = n;
  }
  return out;
}

/** Merge several counters that share one per-device breakdown (e.g. a card's answer counts). */
function mergeCounterGroup<F extends string>(
  fields: readonly F[],
  local: { totals: Record<F, number>; byDevice: unknown },
  remote: { totals: Record<F, number>; byDevice: unknown }
): { totals: Record<F, number>; byDevice: Breakdown<F> | undefined } {
  const totals = {} as Record<F, number>;
  const byDevice: Breakdown<F> = {};
  for (const field of fields) {
    const merged = mergeCounter(
      local.totals[field], column(local.byDevice, field),
      remote.totals[field], column(remote.byDevice, field)
    );
    totals[field] = merged.total;
    for (const [device, n] of Object.entries(merged.buckets ?? {})) (byDevice[device] ??= {})[field] = n;
  }
  return { totals, byDevice: Object.keys(byDevice).length > 0 ? byDevice : undefined };
}

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

const CARD_COUNTS = ['n', 'c', 'mn', 'mc'] as const;

const cardTotals = (h: IRTCardHistory): Record<keyof DeviceCardCounts, number> => ({
  n: finite(h.timesAnswered), c: finite(h.timesCorrect), mn: finite(h.mcTimesAnswered), mc: finite(h.mcTimesCorrect),
});

/**
 * Merge two copies of one card's history. Scheduling state (box, review
 * date, difficulty estimates, streak) comes from the more recently answered
 * copy; answer counts are per-device counters, so answers made on both
 * devices since the last sync all count.
 */
export function mergeCardHistory(a: IRTCardHistory, b: IRTCardHistory): IRTCardHistory {
  const newer = text(b.lastAnsweredDate) > text(a.lastAnsweredDate) ? b : a;
  const { totals, byDevice } = mergeCounterGroup(
    CARD_COUNTS,
    { totals: cardTotals(a), byDevice: a.byDevice },
    { totals: cardTotals(b), byDevice: b.byDevice }
  );
  const merged: IRTCardHistory = { ...newer, timesAnswered: totals.n, timesCorrect: totals.c };
  if (totals.mn || newer.mcTimesAnswered !== undefined) merged.mcTimesAnswered = totals.mn;
  if (totals.mc || newer.mcTimesCorrect !== undefined) merged.mcTimesCorrect = totals.mc;
  if (byDevice) merged.byDevice = byDevice;
  else delete merged.byDevice;
  return merged;
}

/**
 * Merge two copies of a deck profile (e.g. this device and the cloud).
 * Cards are merged one by one (see mergeCardHistory). Ability comes from the
 * copy with more accumulated evidence (ties: the more recent one); ability
 * history is the sorted, de-duplicated union of both.
 */
export function mergeProfiles(local: IRTProfile | undefined, remote: IRTProfile | undefined): IRTProfile {
  if (isEmpty(remote)) return isEmpty(local) ? { ability: 0, cardHistory: {} } : normalizeProfile(local!);
  if (isEmpty(local)) return normalizeProfile(remote!);
  const l = normalizeProfile(local!);
  const r = normalizeProfile(remote!);

  const cardHistory: Record<string, IRTCardHistory> = { ...l.cardHistory };
  for (const [key, entry] of Object.entries(r.cardHistory)) {
    cardHistory[key] = cardHistory[key] ? mergeCardHistory(cardHistory[key], entry) : entry;
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
  const infoL = initialAbilityInfo(l);
  const infoR = initialAbilityInfo(r);
  const source = infoL === infoR ? newer : infoR > infoL ? r : l;
  const updatedAt = [l.updatedAt, r.updatedAt].filter((t): t is string => typeof t === 'string').sort().pop();
  return {
    ability: source.ability,
    abilityInfo: source.abilityInfo,
    cardHistory,
    abilityHistory,
    updatedAt,
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

/** Lower sorts first; used to pick the same pending survivor on every device. */
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
  return mergeVocabularyWithAliases(local, remote).vocabulary;
}

/**
 * mergeVocabulary, also returning which word ids were dropped as duplicates
 * and the id each was collapsed into, so their study history can follow.
 */
export function mergeVocabularyWithAliases(
  local: UserVocabulary | undefined,
  remote: UserVocabulary | undefined
): { vocabulary: UserVocabulary; replaced: Record<string, string> } {
  // Duplicates within a single copy are collapsed too, so run even when one side is empty
  if (isEmpty(local) && isEmpty(remote)) {
    return { vocabulary: { words: [], deletedIds: [], lastUpdated: '' }, replaced: {} };
  }
  if (isEmpty(remote) || isEmpty(local)) {
    const only = normalizeVocabulary((isEmpty(remote) ? local : remote)!);
    const { words, replaced } = collapseDuplicates(only.words, only, only, new Set(only.deletedIds));
    return { vocabulary: Object.keys(replaced).length ? { ...only, words } : only, replaced };
  }
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

  const { words, replaced, byWord } = collapseDuplicates([...byId.values()], newer, older, deleted, wordStamp);

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
  const vocabulary = {
    words,
    // Left out when neither side has a queue, so merging identical copies changes nothing
    ...(local!.pending || remote!.pending ? { pending } : {}),
    deletedIds,
    lastUpdated: newer.lastUpdated,
  };
  return { vocabulary, replaced };
}

/**
 * A word added on two devices has two ids; keep one, the same one everywhere:
 * the most recently edited copy (ties: the lower id). Deleted words are dropped.
 */
function collapseDuplicates(
  all: VocabularyCard[],
  newer: Required<UserVocabulary>,
  older: Required<UserVocabulary>,
  deleted: Set<string>,
  wordStamp: (word: VocabularyCard, owner: Required<UserVocabulary>) => string =
    (word, owner) => text(word.updatedAt) || owner.lastUpdated
) {
  const newerIds = new Set(newer.words.map(w => w.id));
  const stamp = (w: VocabularyCard) => wordStamp(w, newerIds.has(w.id) ? newer : older);
  const latestFirst = (a: VocabularyCard, b: VocabularyCard) =>
    stamp(b).localeCompare(stamp(a)) || a.id.localeCompare(b.id);
  const byWord = new Map<string, VocabularyCard>();
  const replaced: Record<string, string> = {};
  for (const word of all.filter(w => !deleted.has(w.id)).sort(latestFirst)) {
    const key = normalizeWord(word.word);
    const kept = byWord.get(key);
    if (kept) replaced[word.id] = kept.id;
    else byWord.set(key, word);
  }
  const keptIds = new Set([...byWord.values()].map(w => w.id));
  return { words: all.filter(w => keptIds.has(w.id)), replaced, byWord };
}

/**
 * Move study history from vocabulary ids dropped as duplicates to the id that
 * replaced them. If both have history, the one answered more recently is kept
 * (its answer counts merged with the other's).
 */
export function carryOverHistory(profile: IRTProfile, replaced: Record<string, string>): IRTProfile {
  const moves = Object.entries(replaced).filter(([dropped]) => profile.cardHistory?.[dropped]);
  if (moves.length === 0) return profile;
  const cardHistory = { ...profile.cardHistory };
  for (const [dropped, survivor] of moves) {
    const moved = { ...cardHistory[dropped], cardId: survivor };
    delete cardHistory[dropped];
    const existing = cardHistory[survivor];
    cardHistory[survivor] = existing
      ? { ...mergeCardHistory(existing, moved), cardId: survivor }
      : moved;
  }
  return { ...profile, cardHistory };
}

/** Key in the cloud's incorrect_counts column that holds the per-device breakdown. */
export const COUNTS_BY_DEVICE_FIELD = '__byDevice';

/**
 * Merge per-card miss counts. Each side is the flat { cardId: n } map plus
 * its per-device breakdown { deviceId: { cardId: n } } (undefined if absent).
 */
export function mergeCounts(
  local: Record<string, number> | undefined,
  remote: Record<string, number> | undefined,
  localByDevice?: CountsByDevice,
  remoteByDevice?: CountsByDevice
): { counts: Record<string, number>; byDevice: CountsByDevice | undefined } {
  const flat = (source: unknown) =>
    isRecord(source) ? Object.fromEntries(Object.entries(source).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number> : {};
  const l = flat(local);
  const r = flat(remote);
  // Transpose { device: { card: n } } to { card: { device: n } }, keeping "has a breakdown" as {}
  const perCard = (byDevice: unknown) => {
    if (!isRecord(byDevice) || Object.keys(byDevice).length === 0) return undefined;
    const out: Record<string, Buckets> = {};
    for (const [device, cards] of Object.entries(byDevice)) {
      if (!isRecord(cards)) continue;
      for (const [card, n] of Object.entries(cards)) if (typeof n === 'number') (out[card] ??= {})[device] = n;
    }
    return out;
  };
  const lb = perCard(localByDevice);
  const rb = perCard(remoteByDevice);

  const counts: Record<string, number> = {};
  const byDevice: CountsByDevice = {};
  const ids = new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(lb ?? {}), ...Object.keys(rb ?? {})]);
  for (const id of ids) {
    const merged = mergeCounter(l[id] ?? 0, lb ? lb[id] ?? {} : undefined, r[id] ?? 0, rb ? rb[id] ?? {} : undefined);
    if (merged.total > 0 || id in l || id in r) counts[id] = merged.total;
    for (const [device, n] of Object.entries(merged.buckets ?? {})) (byDevice[device] ??= {})[id] = n;
  }
  return { counts, byDevice: lb || rb ? byDevice : undefined };
}

function normalizeStats(stats: StudyStats): StudyStats {
  return {
    totalCardsReviewed: finite(stats.totalCardsReviewed),
    totalCorrect: finite(stats.totalCorrect),
    totalIncorrect: finite(stats.totalIncorrect),
    lastStudyDate: text(stats.lastStudyDate),
    streak: finite(stats.streak),
    ...(isRecord(stats.devices) ? { devices: stats.devices } : {}),
    ...(text(stats.progressResetAt) ? { progressResetAt: text(stats.progressResetAt) } : {}),
  };
}

/** A copy's progress reset point ('' if it was never reset). */
export const progressResetAt = (stats: unknown): string =>
  isRecord(stats) ? text(stats.progressResetAt) : '';

const STAT_COUNTS = ['reviewed', 'correct', 'incorrect'] as const;
const statTotals = (s: StudyStats): Record<keyof DeviceStudyTotals, number> => ({
  reviewed: s.totalCardsReviewed, correct: s.totalCorrect, incorrect: s.totalIncorrect,
});

export function mergeStats(local: StudyStats | undefined, remote: StudyStats | undefined): StudyStats {
  if (isEmpty(remote)) return isEmpty(local) ? EMPTY_STUDY_STATS : normalizeStats(local!);
  if (isEmpty(local)) return normalizeStats(remote!);
  const l = normalizeStats(local!);
  const r = normalizeStats(remote!);

  const latest = r.lastStudyDate > l.lastStudyDate ? r : l;
  // Totals are per-device counters, so study on two devices adds up
  const { totals, byDevice } = mergeCounterGroup(
    STAT_COUNTS,
    { totals: statTotals(l), byDevice: l.devices },
    { totals: statTotals(r), byDevice: r.devices }
  );
  return {
    totalCardsReviewed: totals.reviewed,
    totalCorrect: totals.correct,
    totalIncorrect: totals.incorrect,
    lastStudyDate: latest.lastStudyDate,
    streak: r.lastStudyDate === l.lastStudyDate ? Math.max(l.streak, r.streak) : latest.streak,
    ...(byDevice ? { devices: byDevice } : {}),
    ...(l.progressResetAt || r.progressResetAt
      ? { progressResetAt: [l.progressResetAt ?? '', r.progressResetAt ?? ''].sort()[1] }
      : {}),
  };
}
