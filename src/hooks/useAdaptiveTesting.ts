import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { FlashCard, IRTCardHistory, IRTProfile, Rating, StudySession, ConfidencePrediction, CardFormat } from '../types';
import { RATING_VALUES } from '../types';
import {
  BOX_INTERVAL_DAYS,
  MAX_BOX,
  MC_BOX_CAP,
  buildDifficultyPriors,
  getItemParams,
  initialAbilityInfo,
  isDue,
  migrateProfile,
  reviewDateFor,
  selectNextCard,
  updateAbility,
  updateItemDifficulty,
} from '../lib/irt';
import { MAX_ABILITY_HISTORY } from '../lib/merge';
import { setToStorage, updateStudyStats, incrementIncorrectCount } from '../lib/storage';
import { useStorageValue } from './useStorageValue';

/** Cards per session before the summary is shown. */
export const DEFAULT_SESSION_SIZE = 20;

interface UseAdaptiveTestingOptions {
  cards: FlashCard[];
  storageKey: string;
  sessionSize?: number;
  /** Offer every card regardless of its review date (e.g. trouble-card drills). */
  ignoreSchedule?: boolean;
}

interface Selection {
  card: FlashCard;
  format: CardFormat;
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
  /** Cards due for review (including new ones) that haven't been seen this session. */
  dueCount: number;
  masteryLevel: number;
  hasMoreCards: boolean;
  /** Nothing is due; the user can choose to study ahead. */
  isCaughtUp: boolean;
  studyAhead: () => void;
  resetSession: () => void;
  recordPrediction: (prediction: ConfidencePrediction) => void;
  hasPrediction: boolean;
  /** The answer to the current card has been shown, so a prediction no longer counts. */
  answerSeen: boolean;
  /** Cards skipped this session. */
  skippedCount: number;
  userAbility: number;
}

const EMPTY_PROFILE: IRTProfile = { ability: 0, cardHistory: {} };

function newSession(): StudySession {
  return {
    cardsReviewed: 0,
    correctCount: 0,
    incorrectCount: 0,
    startTime: new Date().toISOString(),
    categoryStats: {},
    predictions: { total: 0, correct: 0 },
  };
}

/**
 * Next Leitner box for a rating. "Hard" is a correct answer that doesn't earn
 * a longer interval, in either format. A correct MC answer can't move a card
 * past MC_BOX_CAP on its own, but never demotes one already above it.
 */
export function nextBox(box: number, rating: Rating, format: CardFormat): number {
  if (rating < RATING_VALUES.hard) return 0;
  if (rating === RATING_VALUES.hard) return Math.max(1, box);
  if (format === 'mc') return box >= MC_BOX_CAP ? box : box + 1;
  if (rating === RATING_VALUES.easy) return Math.min(MAX_BOX, box + 2);
  return Math.min(MAX_BOX, box + 1);
}

export function useAdaptiveTesting({
  cards,
  storageKey,
  sessionSize = DEFAULT_SESSION_SIZE,
  ignoreSchedule = false,
}: UseAdaptiveTestingOptions): UseAdaptiveTestingReturn {
  const irtProfile = useStorageValue<IRTProfile>(storageKey, EMPTY_PROFILE);

  // One-time upgrade of profiles saved with separate `-mc` history entries
  useEffect(() => {
    const migrated = migrateProfile(irtProfile);
    if (migrated) setToStorage(storageKey, migrated);
  }, [irtProfile, storageKey]);

  const [isFlipped, setIsFlipped] = useState(false);
  const [answerSeen, setAnswerSeen] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [reviewedInSession, setReviewedInSession] = useState<Set<string>>(() => new Set());
  const [currentPrediction, setCurrentPrediction] = useState<ConfidencePrediction | null>(null);
  const [isStudyingAhead, setIsStudyingAhead] = useState(false);
  const [session, setSession] = useState<StudySession>(newSession);
  // Due-ness is evaluated against the session start so cards don't appear mid-session
  const [sessionNow, setSessionNow] = useState(() => Date.now());
  const [pinned, setPinned] = useState<Selection | null>(null);
  // Guards against a double tap rating the same card twice
  const ratedCardId = useRef<string | null>(null);

  const priors = useMemo(() => buildDifficultyPriors(cards), [cards]);

  const unseenCards = useMemo(
    () => cards.filter(card => !reviewedInSession.has(card.id)),
    [cards, reviewedInSession]
  );

  const dueCards = useMemo(
    () => unseenCards.filter(card => isDue(irtProfile.cardHistory[card.id], sessionNow)),
    [unseenCards, irtProfile.cardHistory, sessionNow]
  );

  const candidates = ignoreSchedule || isStudyingAhead ? unseenCards : dueCards;
  const sessionComplete = session.cardsReviewed >= sessionSize || candidates.length === 0;

  // A tab left open (e.g. overnight) would otherwise keep judging due-ness
  // against when it was opened. Refresh on return, but not mid-session, so
  // cards don't appear while the user is working through a deck.
  const canRefreshNow = sessionComplete || (session.cardsReviewed === 0 && reviewedInSession.size === 0);
  useEffect(() => {
    if (!canRefreshNow) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') setSessionNow(Date.now());
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [canRefreshNow]);

  // Keep showing the same card until it's answered or skipped, even if the
  // profile changes underneath it (e.g. a cloud sync lands mid-card).
  const selection = useMemo<Selection | null>(() => {
    if (sessionComplete) return null;
    if (pinned && candidates.some(c => c.id === pinned.card.id)) return pinned;
    return selectNextCard(irtProfile.ability, candidates, irtProfile.cardHistory, priors, sessionNow);
  }, [sessionComplete, pinned, candidates, irtProfile.ability, irtProfile.cardHistory, priors, sessionNow]);

  useEffect(() => {
    if (selection !== pinned) setPinned(selection);
  }, [selection, pinned]);

  const currentCard = selection?.card ?? null;
  const currentFormat = selection?.format ?? 'open';

  // Mastery level approximation (normalized ability score from -4 to 4 -> 0 to 100)
  const masteryLevel = useMemo(() => {
    const score = ((irtProfile.ability + 4) / 8) * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [irtProfile.ability]);

  const flipCard = useCallback(() => {
    setIsFlipped(prev => !prev);
    setAnswerSeen(true);
  }, []);

  const advance = useCallback((cardId: string) => {
    setCurrentPrediction(null);
    setIsFlipped(false);
    setAnswerSeen(false);
    setReviewedInSession(prev => new Set(prev).add(cardId));
  }, []);

  const skipCard = useCallback(() => {
    if (!currentCard) return;
    // Excluded for the rest of this session; ability and schedule are untouched
    setSkippedCount(n => n + 1);
    advance(currentCard.id);
  }, [currentCard, advance]);

  const recordPrediction = useCallback((prediction: ConfidencePrediction) => {
    // A prediction made after seeing the answer would inflate prediction accuracy
    if (answerSeen) return;
    setCurrentPrediction(prediction);
  }, [answerSeen]);

  const rateCard = useCallback((rating: Rating) => {
    if (!currentCard || ratedCardId.current === currentCard.id) return;
    ratedCardId.current = currentCard.id;

    const isCorrect = rating >= RATING_VALUES.hard;
    const now = new Date();
    const history: IRTCardHistory = irtProfile.cardHistory[currentCard.id] ??
      { cardId: currentCard.id, timesAnswered: 0, timesCorrect: 0, leitnerBox: 0 };
    const item = getItemParams(currentCard, history, currentFormat, priors);

    const estimate = updateAbility(
      { ability: irtProfile.ability, info: initialAbilityInfo(irtProfile) },
      item,
      isCorrect
    );

    const box = nextBox(history.leitnerBox ?? 0, rating, currentFormat);
    const intervalBox = currentFormat === 'mc' ? Math.min(box, MC_BOX_CAP) : box;
    const nextReview = reviewDateFor(now, BOX_INTERVAL_DAYS[intervalBox]);

    const isMc = currentFormat === 'mc';
    const answeredInFormat = isMc ? history.mcTimesAnswered ?? 0 : history.timesAnswered;
    const calibrated = updateItemDifficulty(irtProfile.ability, item, isCorrect, answeredInFormat);

    const updatedHistory: IRTCardHistory = {
      ...history,
      lastAnsweredDate: now.toISOString(),
      leitnerBox: box,
      nextReviewDate: nextReview.toISOString(),
      correctStreak: isCorrect ? (history.correctStreak ?? 0) + 1 : 0,
      ...(isMc
        ? {
            mcTimesAnswered: answeredInFormat + 1,
            mcTimesCorrect: (history.mcTimesCorrect ?? 0) + (isCorrect ? 1 : 0),
            estMcDifficulty: calibrated,
          }
        : {
            timesAnswered: history.timesAnswered + 1,
            timesCorrect: history.timesCorrect + (isCorrect ? 1 : 0),
            estDifficulty: calibrated,
          }),
    };

    setToStorage<IRTProfile>(storageKey, {
      ability: estimate.ability,
      abilityInfo: estimate.info,
      abilityHistory: [
        ...(irtProfile.abilityHistory ?? []),
        { date: now.toISOString(), ability: estimate.ability },
      ].slice(-MAX_ABILITY_HISTORY),
      cardHistory: { ...irtProfile.cardHistory, [currentCard.id]: updatedHistory },
      updatedAt: now.toISOString(),
    });

    if (rating === RATING_VALUES.again) {
      incrementIncorrectCount(currentCard.id);
    }
    updateStudyStats(isCorrect ? 1 : 0, isCorrect ? 0 : 1);

    const cat = currentCard.category ?? 'Uncategorized';
    const prediction = currentPrediction;
    setSession(prev => {
      const existing = prev.categoryStats[cat] ?? { correct: 0, total: 0 };
      // A prediction is right when "know" is followed by a correct answer or "unsure" by a miss
      const predictionCorrect = prediction !== null && (prediction === 'know') === isCorrect;
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
          total: prev.predictions.total + (prediction !== null ? 1 : 0),
          correct: prev.predictions.correct + (predictionCorrect ? 1 : 0),
        },
      };
    });

    advance(currentCard.id);
  }, [currentCard, currentFormat, irtProfile, priors, storageKey, currentPrediction, advance]);

  const resetSession = useCallback(() => {
    ratedCardId.current = null;
    setReviewedInSession(new Set());
    setIsFlipped(false);
    setAnswerSeen(false);
    setSkippedCount(0);
    setCurrentPrediction(null);
    setIsStudyingAhead(false);
    setPinned(null);
    setSessionNow(Date.now());
    setSession(newSession());
  }, []);

  const studyAhead = useCallback(() => {
    resetSession();
    setIsStudyingAhead(true);
  }, [resetSession]);

  return {
    currentCard,
    currentFormat,
    isFlipped,
    flipCard,
    rateCard,
    skipCard,
    session,
    totalCards: cards.length,
    dueCount: dueCards.length,
    masteryLevel,
    hasMoreCards: !sessionComplete,
    isCaughtUp: dueCards.length === 0 && !ignoreSchedule && !isStudyingAhead,
    studyAhead,
    resetSession,
    recordPrediction,
    hasPrediction: currentPrediction !== null,
    answerSeen,
    skippedCount,
    userAbility: irtProfile.ability,
  };
}
