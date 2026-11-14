import { useState, useMemo, useCallback, useId } from 'react';
import { FlashCard } from './FlashCard';
import { SkipButton } from './SkipButton';
import { StickyRatingBar } from './StickyRatingBar';
import { EmptyState } from './EmptyState';
import { CategoryFilter } from './CategoryFilter';
import { ConfidenceButtons } from './ConfidenceButtons';
import { StudyHeader } from './StudyHeader';
import { StudyStats, SessionTally } from './StudyStats';
import { SessionEndState } from './SessionEndState';
import { useMultipleChoice } from '../hooks/useMultipleChoice';
import { useAdaptiveTesting } from '../hooks/useAdaptiveTesting';
import { useStorageValue } from '../hooks/useStorageValue';
import { useStudyShortcuts } from '../hooks/useStudyShortcuts';
import {
  STORAGE_KEYS,
  EMPTY_STUDY_STATS,
  currentStreak,
  TROUBLE_GRADUATION_STREAK,
  troubleCardIdsFrom,
  type StudyStats as StudyStatsData,
} from '../lib/storage';
import { MyFacts } from './MyFacts';
import { EMPTY_FACTS, factsToCards } from '../lib/facts';
import type { FactDeck, IRTProfile, TriviaCard, UserFacts } from '../types';

const NO_COUNTS: Record<string, number> = {};
const EMPTY_PROFILE: IRTProfile = { ability: 0, cardHistory: {} };
const TROUBLE_HELP = `Drill cards you've missed more than once. A card leaves the list after ${TROUBLE_GRADUATION_STREAK} correct answers in a row.`;

export interface DeckStudyProps {
  /** Whether this tab is visible (keyboard shortcuts only apply then). */
  isActive: boolean;
  title: string;
  /** Which deck user-added facts are filed under. */
  deck: FactDeck;
  cards: TriviaCard[];
  /** Categories offered when adding a fact. */
  categories: readonly string[];
  /** Where this deck's progress (ability and card history) is stored. */
  storageKey: string;
  /** Shown when a filter leaves no cards, e.g. "trivia cards". */
  cardNoun: string;
}

/** Study screen for a question-and-answer deck with categories (Trivia, Data Science). */
export function DeckStudy({ isActive, title, deck, cards: builtInCards, categories: deckCategories, storageKey, cardNoun }: DeckStudyProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [troubleOnly, setTroubleOnly] = useState(false);
  const stats = useStorageValue<StudyStatsData>(STORAGE_KEYS.STUDY_STATS, EMPTY_STUDY_STATS);
  // The user's own facts that have an answer are studied alongside the built-in cards
  const userFacts = useStorageValue<UserFacts>(STORAGE_KEYS.USER_FACTS, EMPTY_FACTS);
  const deckFacts = useMemo(() => userFacts.facts.filter(f => f.deck === deck), [userFacts, deck]);
  const cards = useMemo(() => [...builtInCards, ...factsToCards(userFacts, deck)], [builtInCards, userFacts, deck]);
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
  const mc = useMultipleChoice(currentCard, currentFormat, handleMultipleChoice);
  const mcAnswered = mc.selected !== null;

  const { options: mcOptions, select: mcSelect, next: mcNext } = mc;
  const mcShortcuts = useMemo(
    () => currentFormat === 'mc'
      ? {
          optionCount: mcOptions.length,
          answered: mcAnswered,
          onSelect: (index: number) => { if (mcOptions[index] !== undefined) mcSelect(mcOptions[index]); },
          onNext: mcNext,
        }
      : undefined,
    [currentFormat, mcOptions, mcAnswered, mcSelect, mcNext]
  );

  useStudyShortcuts({
    enabled: isActive && hasMoreCards,
    canFlip: currentFormat !== 'mc',
    isFlipped,
    onFlip: flipCard,
    onRate: rateCard,
    onSkip: skipCard,
    canSkip: !mcAnswered,
    multipleChoice: mcShortcuts,
  });

  const troubleHelpId = useId();

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      <StudyHeader
        title={title}
        streak={streak}
        masteryLevel={masteryLevel}
        details={
          <>
            <StudyStats ability={userAbility} totalCards={totalCards} dueCount={dueCount} reviewed={session.cardsReviewed} />
            <MyFacts
              deck={deck}
              facts={deckFacts}
              categories={deckCategories}
              defaultCategory={selectedCategory !== 'All' && deckCategories.includes(selectedCategory) ? selectedCategory : deckCategories[0]}
            />
          </>
        }
      >
        {/* Category and trouble filters stay visible on every screen size */}
        <div className="py-2 sm:py-3 border-b border-slate-800">
          <CategoryFilter
            categories={categories}
            selected={selectedCategory}
            onChange={(cat) => { mc.reset(); changeFilter(cat, false); }}
            leading={
              <button
                type="button"
                onClick={() => { mc.reset(); changeFilter(selectedCategory, !troubleOnly); }}
                aria-pressed={troubleOnly}
                aria-describedby={troubleHelpId}
                title={TROUBLE_HELP}
                className={`min-h-11 md:min-h-9 text-sm px-3 rounded-full font-medium whitespace-nowrap transition-colors ${
                  troubleOnly
                    ? 'bg-red-600 text-white'
                    : troubleCount > 0
                      ? 'bg-slate-700 text-red-300 border border-red-700'
                      : 'bg-slate-700 text-slate-300'
                }`}
              >
                ⚠ Trouble{troubleCount > 0 ? ` (${troubleCount})` : ''}
              </button>
            }
          />
          <p id={troubleHelpId} className={troubleOnly ? 'text-xs text-slate-400 px-4 pt-2 text-center' : 'sr-only'}>
            {TROUBLE_HELP}
          </p>
        </div>
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
            caughtUpDescription="Nothing in this deck is due for review. Come back later, or study ahead now."
            special={troubleOnly && troubleCount === 0 ? (
              <EmptyState
                title="No Trouble Cards Yet"
                description={`Keep studying — cards you miss more than once appear here until you get them right ${TROUBLE_GRADUATION_STREAK} times in a row.`}
                icon="cards"
                action={{ label: 'Back to All', onClick: () => changeFilter(selectedCategory, false) }}
              />
            ) : null}
            empty={
              <EmptyState
                title="No Cards Available"
                description={`There are no ${cardNoun} in this selection.`}
                icon="cards"
              />
            }
          />
        ) : currentCard ? (
          <div className="space-y-4 sm:space-y-6">
            <FlashCard
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={flipCard}
              format={currentFormat}
              multipleChoice={mc}
            />

            {currentFormat !== 'mc' && !answerSeen && !hasPrediction && (
              <ConfidenceButtons onPredict={recordPrediction} />
            )}

            {currentFormat !== 'mc' && isFlipped && <StickyRatingBar onRate={rateCard} />}

            <SkipButton onSkip={skipCard} disabled={mcAnswered} />

            <SessionTally session={session} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
