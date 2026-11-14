import { useState, useEffect, useRef } from 'react';
import type { FlashCard as FlashCardType, CardFormat } from '../types';
import type { MultipleChoice } from '../hooks/useMultipleChoice';

interface FlashCardProps {
  card: FlashCardType;
  isFlipped: boolean;
  onFlip: () => void;
  format?: CardFormat;
  /** Options and pick for a multiple-choice card (from useMultipleChoice). */
  multipleChoice?: MultipleChoice;
}

const DIFFICULTY_STYLES = {
  New:    'bg-slate-500/30 text-slate-300',
  Hard:   'bg-red-500/30 text-red-300',
  Medium: 'bg-amber-500/30 text-amber-300',
  Easy:   'bg-emerald-500/30 text-emerald-300',
} as const;

/** Smaller type for long text so it fits a phone-width card. */
function textSize(text: string) {
  if (text.length > 160) return 'text-base md:text-xl';
  if (text.length > 80) return 'text-lg md:text-2xl';
  return 'text-xl md:text-2xl';
}

export function FlashCard({ card, isFlipped, onFlip, format = 'open', multipleChoice }: FlashCardProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const showAnswerButton = useRef<HTMLButtonElement>(null);
  const showQuestionButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const mcOptions = format === 'mc' ? multipleChoice?.options ?? [] : [];
  const selectedMcOption = format === 'mc' ? multipleChoice?.selected ?? null : null;

  // Move focus from the flip control on the face being hidden to the one on the
  // face being shown. Otherwise the next Space/Enter "clicks" the hidden button
  // and flips the card straight back.
  useEffect(() => {
    const [hidden, shown] = isFlipped
      ? [showAnswerButton.current, showQuestionButton.current]
      : [showQuestionButton.current, showAnswerButton.current];
    if (hidden && document.activeElement === hidden) shown?.focus();
  }, [isFlipped]);

  // Reset the hint when the card changes
  useEffect(() => {
    setHintVisible(false);
  }, [card.id, format]);

  // Once an option is picked the options are disabled, so focus Next for Enter/Space
  useEffect(() => {
    if (selectedMcOption !== null) nextButton.current?.focus({ preventScroll: true });
  }, [selectedMcOption]);

  const handleOptionClick = (e: React.MouseEvent, option: string) => {
    e.stopPropagation();
    multipleChoice?.select(option);
  };

  const mcCorrect = selectedMcOption !== null && selectedMcOption === card.back;

  const isOpen = format !== 'mc';

  let difficultyStr: 'New' | 'Hard' | 'Medium' | 'Easy' = 'New';
  let showBadge = false;
  if (card.difficulty !== undefined) {
    showBadge = true;
    if (card.difficulty < -1) difficultyStr = 'Easy';
    else if (card.difficulty > 1) difficultyStr = 'Hard';
    else difficultyStr = 'Medium';
  }

  return (
    <div
      className={`perspective-1000 w-full max-w-md mx-auto ${isOpen ? 'cursor-pointer' : ''}`}
      // Tapping anywhere on the card flips it; the explicit button below is the accessible control
      onClick={isOpen ? onFlip : undefined}
    >
      <div
        className={`grid w-full min-h-64 transition-transform duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front of card */}
        {/* Both faces share one grid cell, so the card is as tall as its longer side */}
        <div className="[grid-area:1/1] flex flex-col backface-hidden" aria-hidden={isFlipped}>
          <div className="flex-1 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-2">
              {card.category && (
                <span className="text-blue-200 text-sm font-medium uppercase tracking-wide">
                  {card.category}
                </span>
              )}
              {showBadge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_STYLES[difficultyStr]}`}>
                  {difficultyStr}
                </span>
              )}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <p className={`text-white ${textSize(card.front)} text-center font-medium leading-relaxed mb-4 break-words`}>
                {card.front}
              </p>
              {format === 'mc' && mcOptions.length > 0 && (
                <div className="w-full flex flex-col gap-2 mt-4">
                  {mcOptions.map((opt, index) => {
                    let btnClass = 'bg-blue-700/80 hover:bg-blue-600 text-white border border-blue-500/50';
                    let mark: string | null = null;
                    if (selectedMcOption !== null) {
                      if (opt === card.back) {
                        btnClass = 'bg-emerald-600 text-white border-2 border-emerald-400';
                        mark = '✓';
                      } else if (opt === selectedMcOption) {
                        btnClass = 'bg-red-600 text-white border-2 border-red-400';
                        mark = '✗';
                      } else {
                        btnClass = 'bg-blue-800/50 text-blue-200 opacity-60 border border-blue-800/50';
                      }
                    }
                    return (
                      <button
                        key={`${index}-${opt}`}
                        type="button"
                        onClick={(e) => handleOptionClick(e, opt)}
                        className={`min-h-11 px-4 py-3 rounded-lg text-left transition-all font-medium text-sm md:text-base flex items-center gap-3 ${btnClass}`}
                        disabled={selectedMcOption !== null}
                        aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                      >
                        <kbd
                          className="hidden sm:inline-flex shrink-0 w-5 h-5 items-center justify-center rounded bg-black/20 text-[11px] font-normal"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </kbd>
                        <span className="flex-1">{opt}</span>
                        {mark && <span className="shrink-0 text-lg font-bold" aria-hidden="true">{mark}</span>}
                      </button>
                    );
                  })}
                  <p className="sr-only" aria-live="polite" role="status">
                    {selectedMcOption === null ? '' : mcCorrect ? 'Correct' : `Incorrect — answer: ${card.back}`}
                  </p>
                  {selectedMcOption !== null && (
                    <div className="mt-2 flex items-center justify-between gap-3 animate-fade-in">
                      <p className={`font-semibold ${mcCorrect ? 'text-emerald-300' : 'text-red-200'}`} aria-hidden="true">
                        {mcCorrect ? '✓ Correct' : '✗ Incorrect'}
                      </p>
                      <button
                        ref={nextButton}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); multipleChoice?.next(); }}
                        className="min-h-11 px-5 rounded-lg bg-white text-blue-800 font-semibold hover:bg-blue-50"
                        aria-keyshortcuts="Enter"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Hint */}
            {card.hint && !hintVisible && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setHintVisible(true); }}
                className="min-h-11 px-3 text-blue-200 text-sm underline mt-2 self-center hover:text-white transition-colors"
                tabIndex={isFlipped ? -1 : 0}
              >
                Show Hint
              </button>
            )}
            {card.hint && hintVisible && (
              <p className="text-blue-100 text-sm italic text-center mt-3 px-2 border-t border-blue-500 pt-3">
                💡 {card.hint}
              </p>
            )}
            {isOpen && (
              <button
                ref={showAnswerButton}
                type="button"
                onClick={(e) => { e.stopPropagation(); onFlip(); }}
                className="min-h-11 px-4 text-blue-100 text-sm text-center mt-2 self-center underline-offset-4 hover:underline"
                tabIndex={isFlipped ? -1 : 0}
              >
                Show answer
              </button>
            )}
          </div>
        </div>

        {/* Back of card */}
        <div className="[grid-area:1/1] flex flex-col backface-hidden rotate-y-180" aria-hidden={!isFlipped}>
          <div className="flex-1 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-2">
              {card.category && (
                <span className="text-emerald-200 text-sm font-medium uppercase tracking-wide">
                  {card.category}
                </span>
              )}
              {showBadge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_STYLES[difficultyStr]}`}>
                  {difficultyStr}
                </span>
              )}
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className={`text-white ${textSize(card.back)} text-center font-medium leading-relaxed whitespace-pre-line break-words`}>
                {card.back}
              </p>
            </div>
            <p className="text-emerald-200 text-sm text-center mt-4">
              Rate your recall below
            </p>
            {isOpen && (
              <button
                ref={showQuestionButton}
                type="button"
                onClick={(e) => { e.stopPropagation(); onFlip(); }}
                className="min-h-11 px-4 text-emerald-100 text-sm text-center mt-1 self-center underline-offset-4 hover:underline"
                tabIndex={isFlipped ? 0 : -1}
              >
                Show question
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
