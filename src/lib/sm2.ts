import type { CardProgress, Rating } from '../types';

/**
 * SM-2 Spaced Repetition Algorithm
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak
 *
 * Quality ratings:
 * 0 - Complete blackout, wrong response
 * 1 - Incorrect, but upon seeing correct answer, remembered
 * 2 - Incorrect, but correct answer seemed easy to recall
 * 3 - Correct with serious difficulty
 * 4 - Correct after hesitation
 * 5 - Perfect response
 */

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Creates initial progress for a new card
 */
export function createInitialProgress(cardId: string): CardProgress {
  return {
    cardId,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    repetitions: 0,
    nextReviewDate: new Date().toISOString().split('T')[0], // Today
  };
}

/**
 * Calculate the new ease factor based on rating
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 */
export function calculateNewEaseFactor(currentEF: number, rating: Rating): number {
  const newEF = currentEF + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  return Math.max(MIN_EASE_FACTOR, newEF);
}

/**
 * Calculate the next interval based on current progress and rating
 */
export function calculateNextInterval(
  repetitions: number,
  interval: number,
  easeFactor: number,
  rating: Rating
): number {
  // If rating is less than 3, reset repetitions
  if (rating < 3) {
    return 1; // Review again tomorrow
  }

  // First successful repetition
  if (repetitions === 0) {
    return 1;
  }

  // Second successful repetition
  if (repetitions === 1) {
    return 6;
  }

  // Subsequent repetitions: interval * easeFactor
  return Math.round(interval * easeFactor);
}

/**
 * Process a card review and return updated progress
 */
export function processReview(
  currentProgress: CardProgress,
  rating: Rating
): CardProgress {
  const today = new Date().toISOString().split('T')[0];

  // Calculate new ease factor
  const newEaseFactor = calculateNewEaseFactor(currentProgress.easeFactor, rating);

  // Determine new repetitions count
  let newRepetitions: number;
  if (rating < 3) {
    // Failed - reset repetitions
    newRepetitions = 0;
  } else {
    // Success - increment repetitions
    newRepetitions = currentProgress.repetitions + 1;
  }

  // Calculate new interval
  const newInterval = calculateNextInterval(
    currentProgress.repetitions,
    currentProgress.interval,
    newEaseFactor,
    rating
  );

  // Calculate next review date
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  const nextReviewDate = nextDate.toISOString().split('T')[0];

  return {
    cardId: currentProgress.cardId,
    easeFactor: newEaseFactor,
    interval: newInterval,
    repetitions: newRepetitions,
    nextReviewDate,
    lastReviewDate: today,
  };
}

/**
 * Check if a card is due for review
 */
export function isDueForReview(progress: CardProgress): boolean {
  const today = new Date().toISOString().split('T')[0];
  return progress.nextReviewDate <= today;
}

/**
 * Sort cards by priority: due cards first, then by next review date
 */
export function sortByPriority(progressList: CardProgress[]): CardProgress[] {
  const today = new Date().toISOString().split('T')[0];

  return [...progressList].sort((a, b) => {
    const aIsDue = a.nextReviewDate <= today;
    const bIsDue = b.nextReviewDate <= today;

    // Due cards come first
    if (aIsDue && !bIsDue) return -1;
    if (!aIsDue && bIsDue) return 1;

    // Among due cards, sort by overdue amount (most overdue first)
    if (aIsDue && bIsDue) {
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    }

    // Among non-due cards, sort by next review date
    return a.nextReviewDate.localeCompare(b.nextReviewDate);
  });
}

/**
 * Get mastery level (0-100) based on card progress
 */
export function getMasteryLevel(progress: CardProgress): number {
  // Mastery based on ease factor and repetitions
  const easeScore = ((progress.easeFactor - MIN_EASE_FACTOR) / (DEFAULT_EASE_FACTOR + 0.5 - MIN_EASE_FACTOR)) * 50;
  const repScore = Math.min(progress.repetitions * 10, 50);
  return Math.min(100, Math.round(easeScore + repScore));
}

/**
 * Calculate overall mastery for a set of cards
 */
export function calculateOverallMastery(progressList: CardProgress[]): number {
  if (progressList.length === 0) return 0;
  const totalMastery = progressList.reduce((sum, p) => sum + getMasteryLevel(p), 0);
  return Math.round(totalMastery / progressList.length);
}
