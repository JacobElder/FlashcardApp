// Card types
export interface FlashCard {
  id: string;
  type: 'trivia' | 'vocabulary';
  front: string;
  back: string;
  category?: string;
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

// SM-2 progress tracking
export interface CardProgress {
  cardId: string;
  easeFactor: number;     // Min 1.3, default 2.5
  interval: number;       // Days until next review
  repetitions: number;    // Consecutive correct answers
  nextReviewDate: string; // ISO date string
  lastReviewDate?: string;
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
}

// Tab types
export type TabType = 'trivia' | 'vocabulary';

// Form data for adding new vocabulary
export interface NewWordFormData {
  word: string;
  definition: string;
  partOfSpeech?: string;
  example?: string;
}
