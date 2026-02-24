import { FlashCard } from '../components/FlashCard';
import { RatingButtons } from '../components/RatingButtons';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { useSpacedRepetition } from '../hooks/useSpacedRepetition';
import { triviaCards } from '../data/triviaCards';

const STORAGE_KEY = 'nyc-trivia-progress';

export function TriviaStudy() {
  const {
    currentCard,
    isFlipped,
    flipCard,
    rateCard,
    skipCard,
    session,
    dueCount,
    newCount,
    totalCards,
    masteryLevel,
    hasMoreCards,
    resetSession,
  } = useSpacedRepetition({
    cards: triviaCards,
    storageKey: STORAGE_KEY,
    newCardsPerSession: 20,
  });

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">
          NYC Trivia Study
        </h1>
        <div className="mt-3">
          <ProgressBar
            value={masteryLevel}
            label="Overall Mastery"
            showPercentage
            color="gradient"
          />
        </div>
      </header>

      {/* Stats */}
      <div className="flex justify-center gap-6 py-4 px-4 border-b border-slate-800">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-400">{dueCount}</p>
          <p className="text-xs text-slate-400">Due</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{newCount}</p>
          <p className="text-xs text-slate-400">New</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-300">{totalCards}</p>
          <p className="text-xs text-slate-400">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-400">
            {session.cardsReviewed}
          </p>
          <p className="text-xs text-slate-400">Reviewed</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="px-4 py-6">
        {!hasMoreCards ? (
          <EmptyState
            title="All Done!"
            description="You've reviewed all available cards for today. Come back tomorrow for more!"
            icon="check"
            action={{
              label: 'Review Again',
              onClick: resetSession,
            }}
          />
        ) : currentCard ? (
          <div className="space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
            />

            <div className="flex justify-center">
              <button
                onClick={skipCard}
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Skip
              </button>
            </div>

            {isFlipped && (
              <div className="animate-fade-in">
                <RatingButtons onRate={rateCard} />
              </div>
            )}

            {/* Session stats */}
            {session.cardsReviewed > 0 && (
              <div className="flex justify-center gap-4 text-sm">
                <span className="text-emerald-400">
                  Correct: {session.correctCount}
                </span>
                <span className="text-red-400">
                  Incorrect: {session.incorrectCount}
                </span>
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
