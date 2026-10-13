import type { CardFormat, FlashCard, IRTCardHistory, IRTProfile } from '../types';

/**
 * Item Response Theory (IRT) - 2PL model for open recall, 3PL (with a
 * guessing floor) for multiple choice.
 */

export const MIN_ABILITY = -4;
export const MAX_ABILITY = 4;
/** Information contributed by the N(0, 1) prior on ability. */
const PRIOR_INFO = 1;
/** Floor on the ability step so the estimate can still track real learning. */
const MIN_ABILITY_STEP = 0.05;
/** How far an MC card's difficulty sits below its open-recall difficulty when not authored. */
const MC_DIFFICULTY_OFFSET = 0.5;
/** Recognition (MC) alone can't schedule a card further out than this Leitner box. */
export const MC_BOX_CAP = 2;
/** Review interval in days for each Leitner box. */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
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
  const answered = Object.values(profile.cardHistory).reduce((n, h) => n + h.timesAnswered, 0);
  return PRIOR_INFO + 0.2 * answered;
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

  return {
    ability: clamp(estimate.ability + step * score, MIN_ABILITY, MAX_ABILITY),
    info,
  };
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
  return clamp(item.difficulty + k * (p - (isCorrect ? 1 : 0)), MIN_ABILITY, MAX_ABILITY);
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
    guessing: 1 / ((card.options?.length ?? 0) + 1),
  };
}

/** A card is due when it has never been answered or its review date has passed. */
export function isDue(history: IRTCardHistory | undefined, now: number): boolean {
  if (!history?.nextReviewDate) return true;
  return new Date(history.nextReviewDate).getTime() <= now;
}

/**
 * Scheduling weight: overdue reviews first, then new cards; cards that aren't
 * due yet (only offered when studying ahead) are heavily discounted.
 */
function scheduleMultiplier(history: IRTCardHistory | undefined, now: number): number {
  if (!history?.nextReviewDate) return 1.0;
  const nextReview = new Date(history.nextReviewDate).getTime();
  if (now < nextReview) return 0.1;
  const daysOverdue = (now - nextReview) / (1000 * 60 * 60 * 24);
  return Math.min(3.0, 1.5 + daysOverdue * 0.1);
}

/**
 * Select the best next card and format: maximum information at the current
 * ability, weighted by how due the card is.
 */
export function selectNextCard(
  userAbility: number,
  availableCards: FlashCard[],
  cardHistory: Record<string, IRTCardHistory>,
  priors: Record<string, number> = {},
  now: number = Date.now()
): { card: FlashCard; format: CardFormat } | null {
  if (availableCards.length === 0) return null;

  let best: { card: FlashCard; format: CardFormat } = { card: availableCards[0], format: 'open' };
  let maxScore = -1;

  for (const card of availableCards) {
    const history = cardHistory[card.id];
    const multiplier = scheduleMultiplier(history, now);
    const formats: CardFormat[] = card.options?.length ? ['open', 'mc'] : ['open'];

    for (const format of formats) {
      const { difficulty, discrimination, guessing } = getItemParams(card, history, format, priors);
      // Small random noise breaks ties between otherwise identical cards
      const score =
        calculateInformation(userAbility, difficulty, discrimination, guessing) * multiplier +
        Math.random() * 0.001;
      if (score > maxScore) {
        maxScore = score;
        best = { card, format };
      }
    }
  }

  return best;
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
          nextReviewDate: mc.nextReviewDate,
        };
  }
  return { ...profile, cardHistory };
}
