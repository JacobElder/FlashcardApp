import { useState, useMemo, useCallback } from 'react';
import { FlashCard } from '../components/FlashCard';
import { RatingButtons } from '../components/RatingButtons';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { CategoryFilter } from '../components/CategoryFilter';
import { ConfidenceButtons } from '../components/ConfidenceButtons';
import { SessionSummary } from '../components/SessionSummary';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { useStorageValue } from '../hooks/useStorageValue';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import {
  STORAGE_KEYS,
  EMPTY_STUDY_STATS,
  currentStreak,
  troubleCardIdsFrom,
  type StudyStats,
} from '../lib/storage';
import { triviaCards } from '../data/triviaCards';

const NO_COUNTS: Record<string, number> = {};

interface TriviaStudyProps {
  /** Whether this tab is visible (keyboard shortcuts only apply then). */
  isActive: boolean;
}

export function TriviaStudy({ isActive }: TriviaStudyProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [troubleOnly, setTroubleOnly] = useState(false);
  const stats = useStorageValue<StudyStats>(STORAGE_KEYS.STUDY_STATS, EMPTY_STUDY_STATS);
  const streak = currentStreak(stats);

  // Incorrect counts determine which cards are "trouble" cards
  const incorrectCounts = useStorageValue(STORAGE_KEYS.INCORRECT_COUNTS, NO_COUNTS);
  const troubleCardIds = useMemo(() => troubleCardIdsFrom(incorrectCounts), [incorrectCounts]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(triviaCards.map(c => c.category))).sort()],
    []
  );

  const filteredCards = useMemo(() => {
    let cards = selectedCategory === 'All'
      ? triviaCards
      : triviaCards.filter(c => c.category === selectedCategory);
    if (troubleOnly) {
      cards = cards.filter(c => troubleCardIds.has(c.id));
    }
    return cards;
  }, [selectedCategory, troubleOnly, troubleCardIds]);

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
    userAbility,
  } = useAdaptiveTesting({
    cards: filteredCards,
    storageKey: STORAGE_KEYS.TRIVIA_PROGRESS,
    // Trouble drills revisit missed cards regardless of their review date
    ignoreSchedule: troubleOnly,
  });

  // Changing the filter starts a new session. Done in the handlers rather than
  // an effect, which would also fire on mount and could undo a first click.
  const changeFilter = (category: string, trouble: boolean) => {
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
          <h1 className="text-xl font-bold text-white">Trivia Study</h1>
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
              : troubleCardIds.size > 0
                ? 'bg-slate-700 text-red-400 border border-red-700'
                : 'bg-slate-700 text-slate-400'
          }`}
        >
          ⚠ Trouble{troubleCardIds.size > 0 ? ` (${troubleCardIds.size})` : ''}
        </button>
      </div>

      {/* Main Content */}
      <main className="px-4 py-6">
        {!hasMoreCards ? (
          session.cardsReviewed > 0 ? (
            <SessionSummary session={session} onReset={resetSession} />
          ) : troubleOnly && troubleCardIds.size === 0 ? (
            <EmptyState
              title="No Trouble Cards Yet"
              description="Keep studying — cards you miss more than once will appear here."
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
              description="There are no trivia cards in this selection."
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

            {currentFormat !== 'mc' && !isFlipped && !hasPrediction && (
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
