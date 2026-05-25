import { useState, useEffect, useMemo } from 'react';
import type { FlashCard as FlashCardType, CardFormat } from '../types';
interface FlashCardProps {
  card: FlashCardType;
  isFlipped: boolean;
  onFlip: () => void;
  format?: CardFormat;
  onMultipleChoiceSelect?: (isCorrect: boolean) => void;
}

const DIFFICULTY_STYLES = {
  New:    'bg-slate-500/30 text-slate-300',
  Hard:   'bg-red-500/30 text-red-300',
  Medium: 'bg-amber-500/30 text-amber-300',
  Easy:   'bg-emerald-500/30 text-emerald-300',
} as const;

export function FlashCard({ card, isFlipped, onFlip, format = 'open', onMultipleChoiceSelect }: FlashCardProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const [selectedMcOption, setSelectedMcOption] = useState<string | null>(null);

  // Reset hint when card changes
  useEffect(() => {
    setHintVisible(false);
    setSelectedMcOption(null);
  }, [card.id, format]);

  const mcOptions = useMemo(() => {
    if (format !== 'mc' || !card.options) return [];
    const all = [...card.options, card.back];
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [card.id, format, card.options, card.back]);

  const handleOptionClick = (e: React.MouseEvent, option: string) => {
    e.stopPropagation();
    if (selectedMcOption) return; // Prevent multiple clicks
    setSelectedMcOption(option);
    
    setTimeout(() => {
      onMultipleChoiceSelect?.(option === card.back);
    }, 1000);
  };

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
      className={`perspective-1000 w-full max-w-md mx-auto ${format === 'mc' ? '' : 'cursor-pointer'}`}
      onClick={format === 'mc' ? undefined : onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (format !== 'mc') onFlip();
        }
      }}
      aria-label={isFlipped ? 'Show question' : 'Show answer'}
    >
      <div
        className={`relative w-full min-h-64 transition-transform duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front of card */}
        <div className="absolute inset-0 backface-hidden">
          <div className="h-full bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl flex flex-col">
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
              <p className="text-white text-xl md:text-2xl text-center font-medium leading-relaxed mb-4">
                {card.front}
              </p>
              {format === 'mc' && mcOptions.length > 0 && (
                <div className="w-full flex flex-col gap-2 mt-4">
                  {mcOptions.map((opt, i) => {
                    let btnClass = 'bg-blue-700/80 hover:bg-blue-600 text-white border border-blue-500/50';
                    if (selectedMcOption) {
                      if (opt === card.back) {
                        btnClass = 'bg-emerald-600 text-white border-2 border-emerald-400';
                      } else if (opt === selectedMcOption) {
                        btnClass = 'bg-red-600 text-white border-2 border-red-400';
                      } else {
                        btnClass = 'bg-blue-800/50 text-blue-300 opacity-50 border-blue-800/50';
                      }
                    }
                    return (
                      <button
                        key={i}
                        onClick={(e) => handleOptionClick(e, opt)}
                        className={`px-4 py-3 rounded-lg text-left transition-all font-medium text-sm md:text-base ${btnClass}`}
                        disabled={!!selectedMcOption}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Hint */}
            {card.hint && !hintVisible && (
              <button
                onClick={(e) => { e.stopPropagation(); setHintVisible(true); }}
                className="text-blue-200 text-sm underline mt-3 self-center hover:text-white transition-colors"
              >
                Show Hint
              </button>
            )}
            {card.hint && hintVisible && (
              <p className="text-blue-100 text-sm italic text-center mt-3 px-2 border-t border-blue-500 pt-3">
                💡 {card.hint}
              </p>
            )}
            {format !== 'mc' && !card.hint && (
              <p className="text-blue-200 text-sm text-center mt-4">
                Tap to reveal answer
              </p>
            )}
          </div>
        </div>

        {/* Back of card */}
        <div className="absolute inset-0 backface-hidden rotate-y-180">
          <div className="h-full bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl flex flex-col">
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
              <p className="text-white text-xl md:text-2xl text-center font-medium leading-relaxed">
                {card.back}
              </p>
            </div>
            <p className="text-emerald-200 text-sm text-center mt-4">
              Rate your recall below
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
