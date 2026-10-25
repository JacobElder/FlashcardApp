// Card types
export type CardFormat = 'open' | 'mc';

export interface FlashCard {
  id: string;
  type: 'trivia' | 'vocabulary';
  front: string;
  back: string;
  options?: string[];
  difficulty?: number;
  discrimination?: number;
  mcDifficulty?: number;
  mcDiscrimination?: number;
  category?: string;
  hint?: string;
  isUserAdded?: boolean;
}

export interface VocabularyCard extends FlashCard {
  type: 'vocabulary';
  word: string;
  definition: string;
  partOfSpeech?: string;
  example?: string;
  /** When a user-added word was last created or edited; lets a sync merge each word separately. */
  updatedAt?: string;
}

export interface TriviaCard extends FlashCard {
  type: 'trivia';
  category: string;
}

// IRT State tracking
export interface IRTCardHistory {
  cardId: string;
  timesAnswered: number;
  timesCorrect: number;
  lastAnsweredDate?: string;
  leitnerBox?: number;
  nextReviewDate?: string;
  /** Running (Elo-style) estimate of this card's open-recall difficulty. */
  estDifficulty?: number;
  /** Running estimate of this card's multiple-choice difficulty. */
  estMcDifficulty?: number;
  mcTimesAnswered?: number;
  mcTimesCorrect?: number;
  /** Correct answers in a row (either format); a miss resets it. Lets trouble cards graduate. */
  correctStreak?: number;
}

export interface IRTProfile {
  ability: number;
  /** Accumulated Fisher information about ability; shrinks the update step as evidence grows. */
  abilityInfo?: number;
  cardHistory: Record<string, IRTCardHistory>;
  abilityHistory?: { date: string; ability: number }[];
  updatedAt?: string;
}

// Rating values for SM-2
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

// Named ratings for UI
export type RatingName = 'again' | 'hard' | 'good' | 'easy';

export const RATING_VALUES: Record<RatingName, Rating> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
} as const;

// Confidence prediction before flip
export type ConfidencePrediction = 'know' | 'unsure';

// Per-category session breakdown
export interface CategorySessionStats {
  correct: number;
  total: number;
}

/**
 * A word captured without a definition, waiting to be looked up. Its id is
 * reused for the card it becomes, so other devices can tell it was resolved.
 */
export interface PendingWord {
  id: string;
  word: string;
  addedAt: string;
  /** 'not_found': the dictionary has no entry, so the user must define it. */
  status: 'queued' | 'not_found';
}

// User-added vocabulary (stored separately)
export interface UserVocabulary {
  words: VocabularyCard[];
  /** Captured words still waiting for a definition. */
  pending?: PendingWord[];
  /** Ids of deleted words, kept so a cloud merge doesn't resurrect them. */
  deletedIds?: string[];
  lastUpdated: string;
}

/** Which study tab a user-added fact belongs to. */
export type FactDeck = 'trivia' | 'data-science';

/**
 * needs_answer: question only, waiting for Claude to research the answer.
 * needs_check: has the user's answer (studied already), waiting to be fact-checked.
 * verified: Claude confirmed the answer. corrected: Claude replaced a wrong answer.
 */
export type FactStatus = 'needs_answer' | 'needs_check' | 'verified' | 'corrected';

/** Something the user wants to learn, added from a study tab. */
export interface UserFact {
  id: string;
  deck: FactDeck;
  category: string;
  question: string;
  answer?: string;
  status: FactStatus;
  /** Claude's explanation or source after checking. */
  note?: string;
  /** The user's answer before Claude corrected it. */
  originalAnswer?: string;
  addedAt: string;
  /** Last edit; lets a sync merge each fact separately. */
  updatedAt: string;
}

export interface UserFacts {
  facts: UserFact[];
  /** Ids of deleted facts, kept so a cloud merge doesn't resurrect them. */
  deletedIds: string[];
  lastUpdated: string;
}

// Study session state
export interface StudySession {
  cardsReviewed: number;
  correctCount: number;
  incorrectCount: number;
  startTime: string;
  categoryStats: Record<string, CategorySessionStats>;
  predictions: {
    total: number;    // cards where user made a prediction
    correct: number;  // "know" then correct, or "unsure" then incorrect
  };
}

// Tab types
export type TabType = 'trivia' | 'vocabulary' | 'data-science' | 'analytics';

// Form data for adding new vocabulary
export interface NewWordFormData {
  word: string;
  definition: string;
  partOfSpeech?: string;
  example?: string;
}
