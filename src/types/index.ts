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
}

export interface IRTProfile {
  ability: number;
  cardHistory: Record<string, IRTCardHistory>;
  abilityHistory?: { date: string; ability: number }[];
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

// User-added vocabulary (stored separately)
export interface UserVocabulary {
  words: VocabularyCard[];
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
    correct: number;  // predicted "know" AND rated >= 3
  };
}

// Tab types
export type TabType = 'trivia' | 'vocabulary' | 'analytics';

// Form data for adding new vocabulary
export interface NewWordFormData {
  word: string;
  definition: string;
  partOfSpeech?: string;
  example?: string;
}
