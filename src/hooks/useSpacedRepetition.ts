import { useState, useCallback, useMemo } from 'react';
import type { FlashCard, CardProgress, Rating, StudySession } from '../types';
import {
  createInitialProgress,
  processReview,
  isDueForReview,
  calculateOverallMastery,
} from '../lib/sm2';
import { getFromStorage, setToStorage, updateStudyStats } from '../lib/storage';

interface UseSpacedRepetitionOptions {
  cards: FlashCard[];
  storageKey: string;
  newCardsPerSession?: number;
}

interface UseSpacedRepetitionReturn {
  currentCard: FlashCard | null;
  isFlipped: boolean;
  flipCard: () => void;
  rateCard: (rating: Rating) => void;
  session: StudySession;
  dueCount: number;
  newCount: number;
  totalCards: number;
  masteryLevel: number;
  hasMoreCards: boolean;
  resetSession: () => void;
  getCardProgress: (cardId: string) => CardProgress | undefined;
}

const DEFAULT_NEW_CARDS_PER_SESSION = 20;

export function useSpacedRepetition({
  cards,
  storageKey,
  newCardsPerSession = DEFAULT_NEW_CARDS_PER_SESSION,
}: UseSpacedRepetitionOptions): UseSpacedRepetitionReturn {
  // Load progress from storage
  const [progressMap, setProgressMap] = useState<Record<string, CardProgress>>(() => {
    return getFromStorage<Record<string, CardProgress>>(storageKey, {});
  });

  // Card display state
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedInSession, setReviewedInSession] = useState<Set<string>>(new Set());

  // Session tracking
  const [session, setSession] = useState<StudySession>(() => ({
    cardsReviewed: 0,
    correctCount: 0,
    incorrectCount: 0,
    startTime: new Date().toISOString(),
  }));

  // Calculate due cards and new cards
  const { dueCards, newCards, studyQueue } = useMemo(() => {
    const due: FlashCard[] = [];
    const newC: FlashCard[] = [];

    cards.forEach(card => {
      const progress = progressMap[card.id];
      if (!progress) {
        newC.push(card);
      } else if (isDueForReview(progress)) {
        due.push(card);
      }
    });

    // Build study queue: due cards first, then limited new cards
    const newToAdd = newC.slice(0, newCardsPerSession);
    const queue = [...due, ...newToAdd].filter(card => !reviewedInSession.has(card.id));

    return { dueCards: due, newCards: newC, studyQueue: queue };
  }, [cards, progressMap, newCardsPerSession, reviewedInSession]);

  // Current card
  const currentCard = studyQueue[currentIndex] || null;

  // Mastery level
  const masteryLevel = useMemo(() => {
    const allProgress = Object.values(progressMap);
    return calculateOverallMastery(allProgress);
  }, [progressMap]);

  // Flip card
  const flipCard = useCallback(() => {
    setIsFlipped(prev => !prev);
  }, []);

  // Rate card and update progress
  const rateCard = useCallback((rating: Rating) => {
    if (!currentCard) return;

    const currentProgress = progressMap[currentCard.id] || createInitialProgress(currentCard.id);
    const newProgress = processReview(currentProgress, rating);

    // Update progress
    const newProgressMap = { ...progressMap, [currentCard.id]: newProgress };
    setProgressMap(newProgressMap);
    setToStorage(storageKey, newProgressMap);

    // Update session stats
    const isCorrect = rating >= 3;
    setSession(prev => ({
      ...prev,
      cardsReviewed: prev.cardsReviewed + 1,
      correctCount: prev.correctCount + (isCorrect ? 1 : 0),
      incorrectCount: prev.incorrectCount + (isCorrect ? 0 : 1),
    }));

    // Update global stats
    updateStudyStats(isCorrect ? 1 : 0, isCorrect ? 0 : 1);

    // Mark as reviewed in session
    setReviewedInSession(prev => new Set([...prev, currentCard.id]));

    // Move to next card
    setIsFlipped(false);
    setCurrentIndex(0); // Reset to start of remaining queue
  }, [currentCard, progressMap, storageKey]);

  // Reset session
  const resetSession = useCallback(() => {
    setReviewedInSession(new Set());
    setCurrentIndex(0);
    setIsFlipped(false);
    setSession({
      cardsReviewed: 0,
      correctCount: 0,
      incorrectCount: 0,
      startTime: new Date().toISOString(),
    });
  }, []);

  // Get progress for a specific card
  const getCardProgress = useCallback((cardId: string) => {
    return progressMap[cardId];
  }, [progressMap]);

  return {
    currentCard,
    isFlipped,
    flipCard,
    rateCard,
    session,
    dueCount: dueCards.length,
    newCount: newCards.length,
    totalCards: cards.length,
    masteryLevel,
    hasMoreCards: studyQueue.length > 0,
    resetSession,
    getCardProgress,
  };
}
