import { useState, useMemo, useEffect, useCallback } from 'react';
import { FlashCard } from '../components/FlashCard';
import { RatingButtons } from '../components/RatingButtons';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { CategoryFilter } from '../components/CategoryFilter';
import { ConfidenceButtons } from '../components/ConfidenceButtons';
import { SessionSummary } from '../components/SessionSummary';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { getStudyStats, getIncorrectCounts } from '../lib/storage';
import { triviaCards } from '../data/triviaCards';
import type { Rating } from '../types';

const STORAGE_KEY = 'nyc-trivia-progress';

export function TriviaStudy() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [troubleOnly, setTroubleOnly] = useState(false);
  const [streak, setStreak] = useState(() => getStudyStats().streak);

  // Read incorrect counts from storage to determine trouble card IDs
  // (independent of hook so it can be used to filter cards passed in)
  const [incorrectCounts, setIncorrectCounts] = useState(() => getIncorrectCounts());

  const troubleCardIds = useMemo(
    () => new Set(Object.entries(incorrectCounts).filter(([, n]) => n > 1).map(([id]) => id)),
    [incorrectCounts]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(triviaCards.map(c => c.category)))],
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
    masteryLevel,
    hasMoreCards,
    resetSession,
    recordPrediction,
    hasPrediction,
    userAbility,
  } = useAdaptiveTesting({
    cards: filteredCards,
    storageKey: STORAGE_KEY,
  });

  // Reset session when filter changes
  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, troubleOnly]);

  const handleRateCard = useCallback((rating: Rating) => {
    rateCard(rating);
    // Refresh streak and incorrect counts from storage after each rating
    setStreak(getStudyStats().streak);
    setIncorrectCounts(getIncorrectCounts());
  }, [rateCard]);



  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">Trivia Study</h1>
          {streak > 0 && (
            <div className="flex items-center gap-1 text-amber-400 text-sm font-semibold">
              <span>🔥</span>
              <span>{streak} day{streak !== 1 ? 's' : ''}</span>
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
          onChange={(cat) => {
            setSelectedCategory(cat);
            setTroubleOnly(false);
          }}
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
          <p className="text-2xl font-bold text-amber-400">{session.cardsReviewed}</p>
          <p className="text-xs text-slate-400">Reviewed</p>
        </div>
        <button
          onClick={() => setTroubleOnly(prev => !prev)}
          className={`text-xs px-3 py-1 rounded-full font-medium self-center transition-colors ${
            troubleOnly
              ? 'bg-red-600 text-white'
              : troubleCardIds.size > 0
                ? 'bg-slate-700 text-red-400 border border-red-700'
                : 'bg-slate-700 text-slate-500'
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
              action={{ label: 'Back to All', onClick: () => setTroubleOnly(false) }}
            />
          ) : (
            <EmptyState
              title="All Done!"
              description="You've reviewed all available cards for today. Come back tomorrow for more!"
              icon="check"
              action={{ label: 'Review Again', onClick: resetSession }}
            />
          )
        ) : currentCard ? (
          <div className="space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
              format={currentFormat}
              onMultipleChoiceSelect={(isCorrect) => handleRateCard(isCorrect ? 5 : 0)}
            />

            {currentFormat !== 'mc' && !isFlipped && !hasPrediction && (
              <ConfidenceButtons onPredict={recordPrediction} />
            )}

            {currentFormat !== 'mc' && (
              <div className="flex justify-center">
                <button
                  onClick={skipCard}
                  className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
                >
                  Skip
                </button>
              </div>
            )}

            {currentFormat !== 'mc' && isFlipped && (
              <div className="animate-fade-in">
                <RatingButtons onRate={handleRateCard} />
              </div>
            )}

            {session.cardsReviewed > 0 && (
              <div className="flex justify-center gap-4 text-sm flex-wrap">
                <span className="text-emerald-400">✓ {session.correctCount}</span>
                <span className="text-red-400">✗ {session.incorrectCount}</span>
                {session.predictions.total > 0 && (
                  <span className="text-amber-400">
                    🎯 {Math.round((session.predictions.correct / session.predictions.total) * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="No Cards Available"
            description="There are no trivia cards to study."
            icon="cards"
          />
        )}
      </main>
    </div>
  );
}
