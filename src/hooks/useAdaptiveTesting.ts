import { useState, useCallback, useMemo } from 'react';
import type { FlashCard, IRTProfile, Rating, StudySession, ConfidencePrediction, CardFormat } from '../types';
import { updateAbility, selectNextCard } from '../lib/irt';
import { getFromStorage, setToStorage, updateStudyStats, getIncorrectCounts, incrementIncorrectCount } from '../lib/storage';

interface UseAdaptiveTestingOptions {
  cards: FlashCard[];
  storageKey: string;
}

interface UseAdaptiveTestingReturn {
  currentCard: FlashCard | null;
  currentFormat: CardFormat;
  isFlipped: boolean;
  flipCard: () => void;
  rateCard: (rating: Rating) => void;
  skipCard: () => void;
  session: StudySession;
  totalCards: number;
  masteryLevel: number;
  hasMoreCards: boolean;
  resetSession: () => void;
  troubleCardIds: Set<string>;
  recordPrediction: (prediction: ConfidencePrediction) => void;
  hasPrediction: boolean;
  userAbility: number;
}

const EMPTY_SESSION: StudySession = {
  cardsReviewed: 0,
  correctCount: 0,
  incorrectCount: 0,
  startTime: new Date().toISOString(),
  categoryStats: {},
  predictions: { total: 0, correct: 0 },
};

export function useAdaptiveTesting({
  cards,
  storageKey,
}: UseAdaptiveTestingOptions): UseAdaptiveTestingReturn {
  
  // Load IRT Profile from storage
  const [irtProfile, setIrtProfile] = useState<IRTProfile>(() => {
    return getFromStorage<IRTProfile>(storageKey, { ability: 0, cardHistory: {} });
  });

  // Incorrect counts (persists across sessions)
  const [incorrectCounts, setIncorrectCounts] = useState<Record<string, number>>(() =>
    getIncorrectCounts()
  );

  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState<Set<string>>(new Set());
  const [currentPrediction, setCurrentPrediction] = useState<ConfidencePrediction | null>(null);

  const [session, setSession] = useState<StudySession>(() => ({
    ...EMPTY_SESSION,
    startTime: new Date().toISOString(),
  }));

  // Determine available cards (cards not yet reviewed in this session)
  const availableCards = useMemo(() => {
    return cards.filter(card => !reviewedInSession.has(card.id));
  }, [cards, reviewedInSession]);

  // Select the next card using IRT maximum information
  const currentSelection = useMemo(() => {
    return selectNextCard(irtProfile.ability, availableCards);
  }, [irtProfile.ability, availableCards]);

  const currentCard = currentSelection?.card ?? null;
  const currentFormat = currentSelection?.format ?? 'open';

  // Mastery level approximation (normalized ability score from -4 to 4 -> 0 to 100)
  const masteryLevel = useMemo(() => {
    const score = ((irtProfile.ability + 4) / 8) * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [irtProfile.ability]);

  const troubleCardIds = useMemo(() => {
    return new Set(
      Object.entries(incorrectCounts)
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    );
  }, [incorrectCounts]);

  const flipCard = useCallback(() => setIsFlipped(prev => !prev), []);

  const skipCard = useCallback(() => {
    if (!currentCard) return;
    setCurrentPrediction(null);
    setIsFlipped(false);
    // Add to reviewed to skip it for this session, but don't update ability
    setReviewedInSession(prev => new Set([...prev, currentCard.id]));
  }, [currentCard]);

  const recordPrediction = useCallback((prediction: ConfidencePrediction) => {
    setCurrentPrediction(prediction);
  }, []);

  const rateCard = useCallback((rating: Rating) => {
    if (!currentCard) return;

    // Convert SM-2 rating to binary correct/incorrect
    const isCorrect = rating >= 3;

    // Update ability using IRT 2PL MLE step
    const diff = currentFormat === 'mc' ? (currentCard.mcDifficulty ?? ((currentCard.difficulty ?? 0) - 1.5)) : (currentCard.difficulty ?? 0);
    const disc = currentFormat === 'mc' ? (currentCard.mcDiscrimination ?? ((currentCard.discrimination ?? 1.0) * 0.8)) : (currentCard.discrimination ?? 1.0);

    const newAbility = updateAbility(
      irtProfile.ability,
      diff,
      disc,
      isCorrect
    );

    const historyKey = currentFormat === 'mc' ? `${currentCard.id}-mc` : currentCard.id;
    const history = irtProfile.cardHistory[historyKey] || { cardId: historyKey, timesAnswered: 0, timesCorrect: 0 };
    
    const newProfile: IRTProfile = {
      ability: newAbility,
      cardHistory: {
        ...irtProfile.cardHistory,
        [historyKey]: {
          cardId: historyKey,
          timesAnswered: history.timesAnswered + 1,
          timesCorrect: history.timesCorrect + (isCorrect ? 1 : 0),
          lastAnsweredDate: new Date().toISOString()
        }
      }
    };

    setIrtProfile(newProfile);
    setToStorage(storageKey, newProfile);

    if (!isCorrect) {
      const newCounts = {
        ...incorrectCounts,
        [currentCard.id]: (incorrectCounts[currentCard.id] ?? 0) + 1,
      };
      setIncorrectCounts(newCounts);
      incrementIncorrectCount(currentCard.id);
    }

    const cat = currentCard.category ?? 'Uncategorized';
    setSession(prev => {
      const existing = prev.categoryStats[cat] ?? { correct: 0, total: 0 };
      const predictionCorrect = currentPrediction !== null && currentPrediction === 'know' && isCorrect;
      return {
        ...prev,
        cardsReviewed: prev.cardsReviewed + 1,
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        incorrectCount: prev.incorrectCount + (isCorrect ? 0 : 1),
        categoryStats: {
          ...prev.categoryStats,
          [cat]: {
            correct: existing.correct + (isCorrect ? 1 : 0),
            total: existing.total + 1,
          },
        },
        predictions: {
          total: prev.predictions.total + (currentPrediction !== null ? 1 : 0),
          correct: prev.predictions.correct + (predictionCorrect ? 1 : 0),
        },
      };
    });

    setCurrentPrediction(null);
    updateStudyStats(isCorrect ? 1 : 0, isCorrect ? 0 : 1);
    setReviewedInSession(prev => new Set([...prev, currentCard.id]));
    setIsFlipped(false);

  }, [currentCard, currentFormat, irtProfile, storageKey, incorrectCounts, currentPrediction]);

  const resetSession = useCallback(() => {
    setReviewedInSession(new Set());
    setIsFlipped(false);
    setCurrentPrediction(null);
    setSession({
      ...EMPTY_SESSION,
      startTime: new Date().toISOString(),
    });
  }, []);

  return {
    currentCard,
    currentFormat,
    isFlipped,
    flipCard,
    rateCard,
    skipCard,
    session,
    totalCards: cards.length,
    masteryLevel,
    hasMoreCards: availableCards.length > 0,
    resetSession,
    troubleCardIds,
    recordPrediction,
    hasPrediction: currentPrediction !== null,
    userAbility: irtProfile.ability
  };
}
