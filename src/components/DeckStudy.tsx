import { useState, useMemo, useCallback } from 'react';
import { FlashCard } from './FlashCard';
import { RatingButtons } from './RatingButtons';
import { ProgressBar } from './ProgressBar';
import { EmptyState } from './EmptyState';
import { CategoryFilter } from './CategoryFilter';
import { ConfidenceButtons } from './ConfidenceButtons';
import { SessionSummary } from './SessionSummary';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { useStorageValue } from '../hooks/useStorageValue';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import {
  STORAGE_KEYS,
  EMPTY_STUDY_STATS,
  currentStreak,
  TROUBLE_GRADUATION_STREAK,
  troubleCardIdsFrom,
  type StudyStats,
} from '../lib/storage';
import type { IRTProfile, TriviaCard } from '../types';

const NO_COUNTS: Record<string, number> = {};
const EMPTY_PROFILE: IRTProfile = { ability: 0, cardHistory: {} };

export interface DeckStudyProps {
  /** Whether this tab is visible (keyboard shortcuts only apply then). */
  isActive: boolean;
  title: string;
  cards: TriviaCard[];
  /** Where this deck's progress (ability and card history) is stored. */
  storageKey: string;
  /** Shown when a filter leaves no cards, e.g. "trivia cards". */
  cardNoun: string;
}

/** Study screen for a question-and-answer deck with categories (Trivia, Data Science). */
export function DeckStudy({ isActive, title, cards, storageKey, cardNoun }: DeckStudyProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [troubleOnly, setTroubleOnly] = useState(false);
  const stats = useStorageValue<StudyStats>(STORAGE_KEYS.STUDY_STATS, EMPTY_STUDY_STATS);
  const streak = currentStreak(stats);

  // Cards missed more than once are "trouble" cards until answered correctly a few times in a row
  const incorrectCounts = useStorageValue(STORAGE_KEYS.INCORRECT_COUNTS, NO_COUNTS);
  const { cardHistory } = useStorageValue<IRTProfile>(storageKey, EMPTY_PROFILE);
  const troubleCardIds = useMemo(
    () => troubleCardIdsFrom(incorrectCounts, cardHistory),
    [incorrectCounts, cardHistory]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(cards.map(c => c.category))).sort()],
    [cards]
  );

  const categoryCards = useMemo(
    () => selectedCategory === 'All' ? cards : cards.filter(c => c.category === selectedCategory),
    [cards, selectedCategory]
  );
  // Trouble cards in the selected category, so the button's count matches what a drill offers
  const troubleCount = useMemo(
    () => categoryCards.filter(c => troubleCardIds.has(c.id)).length,
    [categoryCards, troubleCardIds]
  );
  const filteredCards = useMemo(
    () => troubleOnly ? categoryCards.filter(c => troubleCardIds.has(c.id)) : categoryCards,
    [categoryCards, troubleOnly, troubleCardIds]
  );

  const {
    currentCard,
    currentFormat,
    isFlipped,
    flipCard,
    rateCard,
    skipCard,
    session,
    totalCards,
    dueCount,
    masteryLevel,
    hasMoreCards,
    isCaughtUp,
    studyAhead,
    resetSession,
    recordPrediction,
    hasPrediction,
    answerSeen,
    skippedCount,
    userAbility,
  } = useAdaptiveTesting({
    cards: filteredCards,
    storageKey,
    // Trouble drills revisit missed cards regardless of their review date
    ignoreSchedule: troubleOnly,
  });

  // Changing the filter starts a new session. Done in the handlers rather than
  // an effect, which would also fire on mount and could undo a first click.
  const changeFilter = (category: string, trouble: boolean) => {
    // Re-selecting the current filter shouldn't throw away the session
    if (category === selectedCategory && trouble === troubleOnly) return;
    setSelectedCategory(category);
    setTroubleOnly(trouble);
    resetSession();
  };

  const handleMultipleChoice = useCallback(
    (isCorrect: boolean) => rateCard(isCorrect ? 4 : 0),
    [rateCard]
  );

  useStudyShortcuts({
    enabled: isActive && hasMoreCards,
    canFlip: currentFormat !== 'mc',
    isFlipped,
    onFlip: flipCard,
    onRate: rateCard,
    onSkip: skipCard,
  });

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {streak > 0 && (
            <div className="flex items-center gap-1 text-amber-400 text-sm font-semibold">
              <span aria-hidden="true">🔥</span>
              <span>{streak} day{streak !== 1 ? 's' : ''} streak</span>
            </div>
          )}
        </div>
        <ProgressBar value={masteryLevel} label="Overall Mastery" showPercentage color="gradient" />
      </header>

      {/* Category Filter */}
      <div className="py-3 border-b border-slate-800">
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onChange={(cat) => changeFilter(cat, false)}
        />
      </div>

      {/* Stats row */}
      <div className="flex justify-center gap-4 py-3 px-4 border-b border-slate-800 flex-wrap">
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-400">{userAbility.toFixed(2)}</p>
          <p className="text-xs text-slate-400">Ability (θ)</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-300">{totalCards}</p>
          <p className="text-xs text-slate-400">Total Cards</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-sky-400">{dueCount}</p>
          <p className="text-xs text-slate-400">Due / New</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-400">{session.cardsReviewed}</p>
          <p className="text-xs text-slate-400">Reviewed</p>
        </div>
        <button
          type="button"
          onClick={() => changeFilter(selectedCategory, !troubleOnly)}
          aria-pressed={troubleOnly}
          className={`text-xs px-3 py-1 rounded-full font-medium self-center transition-colors ${
            troubleOnly
              ? 'bg-red-600 text-white'
              : troubleCount > 0
                ? 'bg-slate-700 text-red-400 border border-red-700'
                : 'bg-slate-700 text-slate-400'
          }`}
        >
          ⚠ Trouble{troubleCount > 0 ? ` (${troubleCount})` : ''}
        </button>
      </div>

      {/* Main Content */}
      <main className="px-4 py-6">
        {!hasMoreCards ? (
          session.cardsReviewed > 0 ? (
            <SessionSummary session={session} onReset={resetSession} />
          ) : skippedCount > 0 ? (
            <EmptyState
              title="Nothing Left This Session"
              description="You skipped the remaining cards. Start over to see them again."
              icon="cards"
              action={{ label: 'Start Over', onClick: resetSession }}
            />
          ) : troubleOnly && troubleCount === 0 ? (
            <EmptyState
              title="No Trouble Cards Yet"
              description={`Keep studying — cards you miss more than once appear here until you get them right ${TROUBLE_GRADUATION_STREAK} times in a row.`}
              icon="cards"
              action={{ label: 'Back to All', onClick: () => changeFilter(selectedCategory, false) }}
            />
          ) : isCaughtUp && totalCards > 0 ? (
            <EmptyState
              title="All Caught Up!"
              description="Nothing in this deck is due for review. Come back later, or study ahead now."
              icon="check"
              action={{ label: 'Study Ahead', onClick: studyAhead }}
            />
          ) : (
            <EmptyState
              title="No Cards Available"
              description={`There are no ${cardNoun} in this selection.`}
              icon="cards"
            />
          )
        ) : currentCard ? (
          <div className="space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
              format={currentFormat}
              onMultipleChoiceSelect={handleMultipleChoice}
            />

            {currentFormat !== 'mc' && !answerSeen && !hasPrediction && (
              <ConfidenceButtons onPredict={recordPrediction} />
            )}

            <div className="flex justify-center">
              <button
                type="button"
                onClick={skipCard}
                className="text-slate-400 hover:text-slate-200 text-sm transition-colors"
                aria-keyshortcuts="S"
              >
                Skip
              </button>
            </div>

            {currentFormat !== 'mc' && isFlipped && (
              <div className="animate-fade-in">
                <RatingButtons onRate={rateCard} />
              </div>
            )}

            {session.cardsReviewed > 0 && (
              <div className="flex justify-center gap-4 text-sm flex-wrap">
                <span className="text-emerald-400">✓ {session.correctCount}</span>
                <span className="text-red-400">✗ {session.incorrectCount}</span>
                {session.predictions.total > 0 && (
                  <span className="text-amber-400" title="Prediction accuracy">
                    🎯 {Math.round((session.predictions.correct / session.predictions.total) * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
