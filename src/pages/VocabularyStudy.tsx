import { useState, useMemo } from 'react';
import { FlashCard } from '../components/FlashCard';
import { SkipButton } from '../components/SkipButton';
import { StickyRatingBar } from '../components/StickyRatingBar';
import { EmptyState } from '../components/EmptyState';
import { StudyHeader } from '../components/StudyHeader';
import { StudyStats, SessionTally } from '../components/StudyStats';
import { SessionEndState } from '../components/SessionEndState';
import { AddWordModal } from '../components/AddWordModal';
import { MyWordsList } from '../components/MyWordsList';
import { QuickCapture } from '../components/QuickCapture';
import { PendingWordsList } from '../components/PendingWordsList';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { useStorageValue } from '../hooks/useStorageValue';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import { vocabularyCards } from '../data/vocabularyCards';
import {
  STORAGE_KEYS,
  EMPTY_STUDY_STATS,
  currentStreak,
  addUserWord,
  deleteUserWord,
  EMPTY_VOCABULARY,
  generateWordId,
  queuePendingWords,
  removePendingWord,
  resolvePendingWord,
  toCardFields,
  updateUserWord,
  type StudyStats as StudyStatsData,
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
  const streak = currentStreak(useStorageValue<StudyStatsData>(STORAGE_KEYS.STUDY_STATS, EMPTY_STUDY_STATS));

  // A user word that's also a bundled card (e.g. added by the Word Genius sync)
  // is left out of study and of My Words, so it isn't shown twice.
  const ownWords = useMemo(() => {
    const bundled = new Set(vocabularyCards.map(card => card.word.trim().toLowerCase()));
    return userVocabulary.words.filter(card => !bundled.has(card.word.trim().toLowerCase()));
  }, [userVocabulary.words]);
  const allCards = useMemo(
    () => [...vocabularyCards, ...ownWords].map(card => ({ ...card, category: 'Vocabulary' })),
    [ownWords]
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
      <StudyHeader
        title="Vocabulary Study"
        streak={streak}
        masteryLevel={masteryLevel}
        actions={
          <button
            type="button"
            onClick={openAddModal}
            className="min-h-11 bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Word
          </button>
        }
        details={
          <>
            <StudyStats ability={userAbility} totalCards={totalCards} dueCount={dueCount} reviewed={session.cardsReviewed}>
              <button
                type="button"
                onClick={() => setShowMyWords(prev => !prev)}
                aria-expanded={showMyWords}
                className="min-h-11 text-sm px-4 rounded-full font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
              >
                My Words ({ownWords.length})
              </button>
            </StudyStats>
            {showMyWords && (
              <MyWordsList
                words={ownWords}
                onEdit={(word) => {
                  setEditingWord(word);
                  setIsModalOpen(true);
                }}
                onDelete={(word) => deleteUserWord(word.id)}
              />
            )}
          </>
        }
      >
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
        <div className="pb-3 border-b border-slate-800" />
      </StudyHeader>

      {/* Main Content */}
      <main className="px-4 py-4 sm:py-6">
        {!hasMoreCards ? (
          <SessionEndState
            session={session}
            skippedCount={skippedCount}
            isCaughtUp={isCaughtUp}
            totalCards={totalCards}
            onReset={resetSession}
            onStudyAhead={studyAhead}
            caughtUpDescription="No vocabulary is due for review. Add new words, come back later, or study ahead."
            empty={
              <EmptyState
                title="No Cards Yet"
                description="Add your first vocabulary word to start studying!"
                icon="add"
                action={{ label: 'Add Word', onClick: openAddModal }}
              />
            }
          />
        ) : currentCard ? (
          <div className="space-y-4 sm:space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
            />

            {isFlipped && <StickyRatingBar onRate={rateCard} />}

            <SkipButton onSkip={skipCard} />

            <SessionTally session={session} />
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
