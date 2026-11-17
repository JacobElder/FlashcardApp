import type { CardFormat, FlashCard, IRTCardHistory, IRTProfile } from '../types';

/**
 * Item Response Theory (IRT) - 2PL model for open recall, 3PL (with a
 * guessing floor) for multiple choice.
 */

export const MIN_ABILITY = -4;
export const MAX_ABILITY = 4;
/**
 * Precision of the N(0, 1) prior on ability. The prior enters the recursive
 * (Laplace) update as its starting point: a fresh profile starts at the prior
 * mean 0 with this much information, so the first answers are shrunk toward
 * 0. Each later Newton step works on the running Gaussian approximation of the
 * posterior, which already contains the prior, so it is not re-added per
 * answer (that would count it once per answer instead of once).
 */
export const PRIOR_INFO = 1;
/** Floor on the ability step so the estimate can still track real learning. */
const MIN_ABILITY_STEP = 0.05;
/** How far an MC card's difficulty sits below its open-recall difficulty when not authored. */
const MC_DIFFICULTY_OFFSET = 0.5;
/** Recognition (MC) alone can't schedule a card further out than this Leitner box. */
export const MC_BOX_CAP = 2;
/** Below this chance of open recall (at the current ability), a card with options is shown as MC. */
export const MC_RECALL_THRESHOLD = 0.35;
/** Rough information per past answer, for profiles saved before `abilityInfo` existed. */
const LEGACY_INFO_PER_OPEN_ANSWER = 0.2;
const LEGACY_INFO_PER_MC_ANSWER = 0.1;
/**
 * Review interval in days for each Leitner box. A missed card (box 0) waits
 * until tomorrow: with no wait it was due again at once and, since due cards
 * come before new ones, every reopen served the same missed cards.
 */
export const BOX_INTERVAL_DAYS = [1, 1, 3, 7, 14, 30];
export const MAX_BOX = BOX_INTERVAL_DAYS.length - 1;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface ItemParams {
  difficulty: number;
  discrimination: number;
  /** Lower asymptote: the chance of answering correctly by guessing. */
  guessing: number;
}

/**
 * Probability of a correct response.
 * P(theta) = c + (1 - c) / (1 + exp(-a * (theta - b)))
 */
export function calculateProbability(
  ability: number,
  difficulty: number,
  discrimination: number = 1.0,
  guessing: number = 0
): number {
  return guessing + (1 - guessing) / (1 + Math.exp(-discrimination * (ability - difficulty)));
}

/**
 * Fisher information of an item at the given ability. For c = 0 this is the
 * 2PL a^2 * P * (1 - P); the 3PL form discounts information lost to guessing.
 */
export function calculateInformation(
  ability: number,
  difficulty: number,
  discrimination: number = 1.0,
  guessing: number = 0
): number {
  const p = calculateProbability(ability, difficulty, discrimination, guessing);
  return discrimination ** 2 * ((p - guessing) ** 2 / (1 - guessing) ** 2) * ((1 - p) / p);
}

export interface AbilityEstimate {
  ability: number;
  /** Accumulated information (prior + all answered items). */
  info: number;
}

/** Starting information for a profile saved before `abilityInfo` was tracked. */
export function initialAbilityInfo(profile: IRTProfile): number {
  if (profile.abilityInfo !== undefined) return profile.abilityInfo;
  // MC answers carry less information (guessing floor, lower discrimination)
  return Object.values(profile.cardHistory).reduce(
    (info, h) => info
      + LEGACY_INFO_PER_OPEN_ANSWER * (h.timesAnswered ?? 0)
      + LEGACY_INFO_PER_MC_ANSWER * (h.mcTimesAnswered ?? 0),
    PRIOR_INFO
  );
}

/**
 * One Fisher-scoring step on ability. The step is 1 / accumulated information,
 * so early answers move the estimate a lot and later ones refine it.
 */
export function updateAbility(
  estimate: AbilityEstimate,
  item: ItemParams,
  isCorrect: boolean
): AbilityEstimate {
  const { difficulty: b, discrimination: a, guessing: c } = item;
  const p = calculateProbability(estimate.ability, b, a, c);
  const actual = isCorrect ? 1 : 0;

  // d/dtheta of the log-likelihood (reduces to a * (u - p) for c = 0)
  const score = (a * (actual - p) * (p - c)) / (p * (1 - c));
  const info = estimate.info + calculateInformation(estimate.ability, b, a, c);
  const step = Math.max(MIN_ABILITY_STEP, 1 / info);

  const ability = clamp(estimate.ability + step * score, MIN_ABILITY, MAX_ABILITY);
  // Degenerate parameters (e.g. guessing = 1) give NaN; never let that reach the saved profile
  if (!Number.isFinite(ability) || !Number.isFinite(info)) return estimate;
  return { ability, info };
}

/**
 * Elo-style difficulty calibration: a card answered worse than predicted gets
 * harder, better than predicted gets easier. The step shrinks as the card
 * accumulates answers.
 */
export function updateItemDifficulty(
  ability: number,
  item: ItemParams,
  isCorrect: boolean,
  timesAnswered: number
): number {
  const p = calculateProbability(ability, item.difficulty, item.discrimination, item.guessing);
  const k = Math.max(0.05, 0.4 / (1 + 0.2 * timesAnswered));
  const difficulty = clamp(item.difficulty + k * (p - (isCorrect ? 1 : 0)), MIN_ABILITY, MAX_ABILITY);
  return Number.isFinite(difficulty) ? difficulty : item.difficulty;
}

/** Mean authored difficulty per category, used for cards that have none. */
export function buildDifficultyPriors(cards: FlashCard[]): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const card of cards) {
    if (card.difficulty === undefined) continue;
    const key = card.category ?? '';
    sums[key] ??= { total: 0, n: 0 };
    sums[key].total += card.difficulty;
    sums[key].n += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([k, { total, n }]) => [k, total / n]));
}

export function getItemParams(
  card: FlashCard,
  history: IRTCardHistory | undefined,
  format: CardFormat,
  priors: Record<string, number> = {}
): ItemParams {
  const openDifficulty = history?.estDifficulty ?? card.difficulty ?? priors[card.category ?? ''] ?? 0;
  const openDiscrimination = card.discrimination ?? 1.0;
  if (format === 'open') {
    return { difficulty: openDifficulty, discrimination: openDiscrimination, guessing: 0 };
  }
  return {
    difficulty: history?.estMcDifficulty ?? card.mcDifficulty ?? openDifficulty - MC_DIFFICULTY_OFFSET,
    discrimination: card.mcDiscrimination ?? openDiscrimination * 0.8,
    // Chance of guessing among the options plus the answer; no options means no guessing
    guessing: card.options?.length ? 1 / (card.options.length + 1) : 0,
  };
}

/**
 * When a card answered at `answeredAt` and placed in a box with this interval
 * comes due: the start of the local day N days later, so a card is due all
 * day rather than from the exact minute it was last answered.
 */
export function reviewDateFor(answeredAt: Date, intervalDays: number): Date {
  if (intervalDays <= 0) return new Date(answeredAt);
  const due = new Date(answeredAt);
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + intervalDays);
  return due;
}

/** A card is due when it has never been answered or its review date has passed. */
export function isDue(history: IRTCardHistory | undefined, now: number): boolean {
  if (!history?.nextReviewDate) return true;
  return new Date(history.nextReviewDate).getTime() <= now;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** Total answers in either format. */
export function answerCount(history: IRTCardHistory | undefined): number {
  return (history?.timesAnswered ?? 0) + (history?.mcTimesAnswered ?? 0);
}

/**
 * Questions that only make sense with the options on screen ("Which of these
 * is NOT a city in India?"). Without them the question has no answer.
 */
const REFERS_TO_OPTIONS = /\b(of|from) (the following|these|those)\b|\bwhich one of (the|these)\b/i;

export function needsOptions(card: Pick<FlashCard, 'front' | 'options'>): boolean {
  return Boolean(card.options?.length) && REFERS_TO_OPTIONS.test(card.front);
}

/**
 * Which format to show a card in. A card with options is shown as multiple
 * choice while it's being learned: when it's new, when its last answer was a
 * miss, or (below the MC box cap) when open recall is unlikely at the current
 * ability. Otherwise, and always for cards without options, open recall.
 * A question that refers to its options is always multiple choice.
 */
export function chooseFormat(
  userAbility: number,
  card: FlashCard,
  history: IRTCardHistory | undefined,
  priors: Record<string, number> = {}
): CardFormat {
  if (!card.options?.length) return 'open';
  if (needsOptions(card)) return 'mc';
  if (answerCount(history) === 0) return 'mc';
  if (history?.correctStreak === 0) return 'mc';
  if ((history?.leitnerBox ?? 0) >= MC_BOX_CAP) return 'open';
  const open = getItemParams(card, history, 'open', priors);
  const pOpen = calculateProbability(userAbility, open.difficulty, open.discrimination, open.guessing);
  return pOpen < MC_RECALL_THRESHOLD ? 'mc' : 'open';
}

/**
 * Select the next card and its format, in priority order:
 * 1. Due reviews (cards with a review date that has passed): most overdue
 *    whole days first, information at the current ability as tiebreak.
 * 2. New cards (never scheduled), by information.
 * 3. Cards not yet due (only passed in when studying ahead or drilling):
 *    soonest due first, information as tiebreak.
 */
export function selectNextCard(
  userAbility: number,
  availableCards: FlashCard[],
  cardHistory: Record<string, IRTCardHistory>,
  priors: Record<string, number> = {},
  now: number = Date.now()
): { card: FlashCard; format: CardFormat } | null {
  if (availableCards.length === 0) return null;

  let best: { card: FlashCard; key: [number, number, number] } | null = null;
  for (const card of availableCards) {
    const history = cardHistory[card.id];
    const format = chooseFormat(userAbility, card, history, priors);
    const { difficulty, discrimination, guessing } = getItemParams(card, history, format, priors);
    // Small random noise breaks ties between otherwise identical cards
    const info = calculateInformation(userAbility, difficulty, discrimination, guessing) + Math.random() * 0.001;

    let key: [number, number, number];
    if (!history?.nextReviewDate) {
      key = [1, 0, info];
    } else {
      const reviewAt = new Date(history.nextReviewDate).getTime();
      key = reviewAt <= now
        ? [2, Math.floor((now - reviewAt) / DAY_MS), info]
        : [0, -(reviewAt - now), info];
    }
    if (!best || compareKeys(key, best.key) > 0) best = { card, key };
  }

  const card = best!.card;
  return { card, format: chooseFormat(userAbility, card, cardHistory[card.id], priors) };
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** An MC-only card's review date, pulled in to no later than the MC box cap allows. */
function cappedReviewDate(mc: IRTCardHistory): string | undefined {
  if (!mc.nextReviewDate || !mc.lastAnsweredDate || (mc.leitnerBox ?? 0) <= MC_BOX_CAP) {
    return mc.nextReviewDate;
  }
  const cap = reviewDateFor(new Date(mc.lastAnsweredDate), BOX_INTERVAL_DAYS[MC_BOX_CAP]);
  return new Date(mc.nextReviewDate) > cap ? cap.toISOString() : mc.nextReviewDate;
}

/**
 * Fold legacy `${id}-mc` history entries (from when MC was scheduled
 * separately) into the card's single entry. Returns null if nothing changed.
 */
export function migrateProfile(profile: IRTProfile): IRTProfile | null {
  const mcKeys = Object.keys(profile.cardHistory).filter(key => key.endsWith('-mc'));
  if (mcKeys.length === 0) return null;

  const cardHistory = { ...profile.cardHistory };
  for (const mcKey of mcKeys) {
    const mc = cardHistory[mcKey];
    delete cardHistory[mcKey];
    const id = mcKey.slice(0, -'-mc'.length);
    const base = cardHistory[id];
    cardHistory[id] = base
      ? {
          ...base,
          mcTimesAnswered: (base.mcTimesAnswered ?? 0) + mc.timesAnswered,
          mcTimesCorrect: (base.mcTimesCorrect ?? 0) + mc.timesCorrect,
        }
      : {
          cardId: id,
          timesAnswered: 0,
          timesCorrect: 0,
          mcTimesAnswered: mc.timesAnswered,
          mcTimesCorrect: mc.timesCorrect,
          lastAnsweredDate: mc.lastAnsweredDate,
          leitnerBox: Math.min(mc.leitnerBox ?? 0, MC_BOX_CAP),
          nextReviewDate: cappedReviewDate(mc),
        };
  }
  return { ...profile, cardHistory };
}
