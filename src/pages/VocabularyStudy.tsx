import { useState, useMemo } from 'react';
import { FlashCard } from '../components/FlashCard';
import { RatingButtons } from '../components/RatingButtons';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { AddWordModal } from '../components/AddWordModal';
import { MyWordsList } from '../components/MyWordsList';
import { QuickCapture } from '../components/QuickCapture';
import { PendingWordsList } from '../components/PendingWordsList';
import { SessionSummary } from '../components/SessionSummary';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { useStorageValue } from '../hooks/useStorageValue';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import { vocabularyCards } from '../data/vocabularyCards';
import {
  STORAGE_KEYS,
  addUserWord,
  deleteUserWord,
  EMPTY_VOCABULARY,
  generateWordId,
  queuePendingWords,
  removePendingWord,
  resolvePendingWord,
  toCardFields,
  updateUserWord,
} from '../lib/storage';
import type { VocabularyCard, NewWordFormData, PendingWord } from '../types';

const NO_PENDING: PendingWord[] = [];

interface VocabularyStudyProps {
  /** Whether this tab is visible (keyboard shortcuts only apply then). */
  isActive: boolean;
  /** Focus the capture box on mount (opened from the "Add word" shortcut). */
  autoFocusCapture?: boolean;
}

export function VocabularyStudy({ isActive, autoFocusCapture }: VocabularyStudyProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<VocabularyCard | null>(null);
  // Captured word the dictionary couldn't define, being defined by hand
  const [definingWord, setDefiningWord] = useState<PendingWord | null>(null);
  const [showMyWords, setShowMyWords] = useState(false);
  const userVocabulary = useStorageValue(STORAGE_KEYS.USER_VOCABULARY, EMPTY_VOCABULARY);
  const pending = userVocabulary.pending ?? NO_PENDING;

  // Combine bundled and user vocabulary
  const allCards = useMemo(
    () => [...vocabularyCards, ...userVocabulary.words].map(card => ({ ...card, category: 'Vocabulary' })),
    [userVocabulary.words]
  );

  // Words a save would duplicate: every card and captured word except the one being edited or defined
  const existingWords = useMemo(
    () => [
      ...allCards.filter(card => card.id !== editingWord?.id).map(card => card.word),
      ...pending.filter(item => item.id !== definingWord?.id).map(item => item.word),
    ].map(word => word.trim().toLowerCase()),
    [allCards, editingWord, pending, definingWord]
  );

  const {
    currentCard,
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
    skippedCount,
    userAbility,
  } = useAdaptiveTesting({
    cards: allCards,
    storageKey: STORAGE_KEYS.VOCABULARY_PROGRESS,
  });

  useStudyShortcuts({
    enabled: isActive && hasMoreCards && !isModalOpen,
    canFlip: true,
    isFlipped,
    onFlip: flipCard,
    onRate: rateCard,
    onSkip: skipCard,
  });

  const openAddModal = () => {
    setEditingWord(null);
    setDefiningWord(null);
    setIsModalOpen(true);
  };

  const handleSaveWord = (data: NewWordFormData) => {
    if (editingWord) {
      updateUserWord(editingWord.id, toCardFields(data));
    } else if (!definingWord || !resolvePendingWord(definingWord.id, data)) {
      addUserWord({ id: generateWordId(), type: 'vocabulary', isUserAdded: true, ...toCardFields(data) });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Vocabulary Study</h1>
          <button
            type="button"
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
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

      <QuickCapture
        onCapture={(words) => queuePendingWords(words, allCards.map(card => card.word))}
        autoFocus={autoFocusCapture}
      />
      <PendingWordsList
        pending={pending}
        onDefine={(item) => {
          setEditingWord(null);
          setDefiningWord(item);
          setIsModalOpen(true);
        }}
        onRemove={(item) => removePendingWord(item.id)}
      />

      {/* Stats */}
      <div className="flex justify-center gap-6 py-4 px-4 border-b border-slate-800 flex-wrap">
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
          <p className="text-2xl font-bold text-amber-400">
            {session.cardsReviewed}
          </p>
          <p className="text-xs text-slate-400">Reviewed</p>
        </div>
        <button
          type="button"
          onClick={() => setShowMyWords(prev => !prev)}
          aria-expanded={showMyWords}
          className="text-xs px-3 py-1 rounded-full font-medium self-center bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          My Words ({userVocabulary.words.length})
        </button>
      </div>

      {showMyWords && (
        <MyWordsList
          words={userVocabulary.words}
          onEdit={(word) => {
            setEditingWord(word);
            setIsModalOpen(true);
          }}
          onDelete={(word) => deleteUserWord(word.id)}
        />
      )}

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
          ) : isCaughtUp && totalCards > 0 ? (
            <EmptyState
              title="All Caught Up!"
              description="No vocabulary is due for review. Add new words, come back later, or study ahead."
              icon="check"
              action={{ label: 'Study Ahead', onClick: studyAhead }}
            />
          ) : (
            <EmptyState
              title="No Cards Yet"
              description="Add your first vocabulary word to start studying!"
              icon="add"
              action={{ label: 'Add Word', onClick: openAddModal }}
            />
          )
        ) : currentCard ? (
          <div className="space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
            />

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
        ) : null}
      </main>

      {/* Add / Edit Word Modal */}
      <AddWordModal
        isOpen={isModalOpen}
        initialData={editingWord ?? undefined}
        initialWord={definingWord?.word}
        existingWords={existingWords}
        onClose={() => {
          setIsModalOpen(false);
          setEditingWord(null);
          setDefiningWord(null);
        }}
        onSave={handleSaveWord}
      />
    </div>
  );
}
