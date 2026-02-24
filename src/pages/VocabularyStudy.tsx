import { useState, useMemo } from 'react';
import { FlashCard } from '../components/FlashCard';
import { RatingButtons } from '../components/RatingButtons';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { AddWordModal } from '../components/AddWordModal';
import { useSpacedRepetition } from '../hooks/useSpacedRepetition';
import { vocabularyCards } from '../data/vocabularyCards';
import { getUserVocabulary, addUserWord } from '../lib/storage';
import type { VocabularyCard, NewWordFormData } from '../types';

const STORAGE_KEY = 'nyc-vocabulary-progress';

function generateId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function VocabularyStudy() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Combine bundled and user vocabulary
  const allCards = useMemo(() => {
    const userVocab = getUserVocabulary();
    return [...vocabularyCards, ...userVocab.words];
  }, [refreshKey]);

  const {
    currentCard,
    isFlipped,
    flipCard,
    rateCard,
    session,
    dueCount,
    newCount,
    totalCards,
    masteryLevel,
    hasMoreCards,
    resetSession,
  } = useSpacedRepetition({
    cards: allCards,
    storageKey: STORAGE_KEY,
    newCardsPerSession: 15,
  });

  const handleAddWord = (data: NewWordFormData) => {
    const newCard: VocabularyCard = {
      id: generateId(),
      type: 'vocabulary',
      word: data.word,
      definition: data.definition,
      partOfSpeech: data.partOfSpeech,
      example: data.example,
      front: data.word,
      back: data.definition + (data.example ? `\n\nExample: "${data.example}"` : ''),
      isUserAdded: true,
    };

    addUserWord(newCard);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Vocabulary Study</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Word
          </button>
        </div>
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
            description="You've reviewed all vocabulary for today. Add new words or come back tomorrow!"
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
            title="No Cards Yet"
            description="Add your first vocabulary word to start studying!"
            icon="add"
            action={{
              label: 'Add Word',
              onClick: () => setIsModalOpen(true),
            }}
          />
        )}
      </main>

      {/* Add Word Modal */}
      <AddWordModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddWord}
      />
    </div>
  );
}
