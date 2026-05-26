import type { FlashCard, IRTCardHistory } from '../types';

/**
 * Item Response Theory (IRT) - 2PL Model
 */

/**
 * Calculate probability of a correct response using the 2PL model
 * P(theta) = 1 / (1 + exp(-a * (theta - b)))
 * 
 * @param ability User's latent ability (theta)
 * @param difficulty Item difficulty (b)
 * @param discrimination Item discrimination (a)
 * @returns Probability between 0 and 1
 */
export function calculateProbability(
  ability: number,
  difficulty: number,
  discrimination: number = 1.0
): number {
  return 1 / (1 + Math.exp(-discrimination * (ability - difficulty)));
}

/**
 * Information function for a specific item given the user's ability.
 * Maximum information is obtained when item difficulty matches user ability.
 * I(theta) = a^2 * P(theta) * (1 - P(theta))
 */
export function calculateInformation(
  ability: number,
  difficulty: number,
  discrimination: number = 1.0
): number {
  const p = calculateProbability(ability, difficulty, discrimination);
  return Math.pow(discrimination, 2) * p * (1 - p);
}

/**
 * Updates user ability using Maximum Likelihood Estimation (MLE) approach via gradient descent
 * new_theta = old_theta + (actual - predicted) * step_size
 * 
 * @param currentAbility Current theta estimate
 * @param difficulty Item difficulty (b)
 * @param discrimination Item discrimination (a)
 * @param isCorrect Whether the user answered correctly
 * @param stepSize Learning rate for the update
 */
export function updateAbility(
  currentAbility: number,
  difficulty: number,
  discrimination: number = 1.0,
  isCorrect: boolean,
  stepSize: number = 0.5
): number {
  const predicted = calculateProbability(currentAbility, difficulty, discrimination);
  const actual = isCorrect ? 1 : 0;
  
  // Gradient step
  const update = discrimination * (actual - predicted) * stepSize;
  
  // Bound the ability score to prevent extreme values (e.g., -4 to 4)
  const newAbility = Math.max(-4, Math.min(4, currentAbility + update));
  
  return newAbility;
}

/**
 * Calculate Leitner time-based multiplier
 * Items past their review date get higher priority.
 * Items recently reviewed get drastically reduced priority.
 */
function calculateLeitnerMultiplier(history: IRTCardHistory | undefined): number {
  if (!history || history.leitnerBox === undefined || !history.nextReviewDate) {
    return 1.5; // New cards get a slight priority boost
  }
  
  const now = new Date().getTime();
  const nextReview = new Date(history.nextReviewDate).getTime();
  
  // If we haven't reached the review date, severely penalize priority
  if (now < nextReview) {
    return 0.1;
  }
  
  // If past due, increase priority based on how overdue it is
  // Max multiplier of 3.0
  const daysOverdue = (now - nextReview) / (1000 * 60 * 60 * 24);
  return Math.min(3.0, 1.0 + (daysOverdue * 0.1));
}

/**
 * Select the best next card to show based on maximum information.
 * 
 * @param userAbility Current user ability
 * @param availableCards Array of cards to choose from
 * @param cardHistory User's history to apply Leitner spacing
 * @returns The card that maximizes information gain
 */
export function selectNextCard(
  userAbility: number,
  availableCards: FlashCard[],
  cardHistory: Record<string, IRTCardHistory>
): { card: FlashCard, format: 'open' | 'mc' } | null {
  if (availableCards.length === 0) return null;

  let bestCard = availableCards[0];
  let bestFormat: 'open' | 'mc' = 'open';
  let maxInfo = -1;

  for (const card of availableCards) {
    const historyOpen = cardHistory[card.id];
    const historyMC = cardHistory[`${card.id}-mc`];
    
    // 1. Calculate Information for Open-Ended Format
    const diffOpen = card.difficulty ?? 0;
    const discOpen = card.discrimination ?? 1.0;
    let infoOpen = calculateInformation(userAbility, diffOpen, discOpen);
    
    // Apply Leitner Multiplier
    infoOpen *= calculateLeitnerMultiplier(historyOpen);
    
    // Add small random noise to break ties
    const noiseOpen = Math.random() * 0.001;
    if (infoOpen + noiseOpen > maxInfo) {
      maxInfo = infoOpen + noiseOpen;
      bestCard = card;
      bestFormat = 'open';
    }

    // 2. Calculate Information for MC Format (if distractors exist)
    if (card.options && card.options.length > 0) {
      // Fallback to slightly easier params if missing explicit mc parameters
      const diffMC = card.mcDifficulty ?? (diffOpen - 1.5);
      const discMC = card.mcDiscrimination ?? (discOpen * 0.8);
      let infoMC = calculateInformation(userAbility, diffMC, discMC);
      
      infoMC *= calculateLeitnerMultiplier(historyMC);
      
      const noiseMC = Math.random() * 0.001;
      if (infoMC + noiseMC > maxInfo) {
        maxInfo = infoMC + noiseMC;
        bestCard = card;
        bestFormat = 'mc';
      }
    }
  }

  return { card: bestCard, format: bestFormat };
}
