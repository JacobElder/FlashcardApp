import { useEffect } from 'react';
import type { Rating } from '../types';
import { RATING_VALUES } from '../types';

const RATING_KEYS: Record<string, Rating> = {
  '1': RATING_VALUES.again,
  '2': RATING_VALUES.hard,
  '3': RATING_VALUES.good,
  '4': RATING_VALUES.easy,
};

interface MultipleChoiceShortcuts {
  optionCount: number;
  /** An option has been picked and its result is showing. */
  answered: boolean;
  /** Pick the option at this (0-based) display position. */
  onSelect: (index: number) => void;
  /** Move on from an answered card. */
  onNext: () => void;
}

interface StudyShortcuts {
  enabled: boolean;
  /** Open-recall card is showing (MC cards are answered by picking an option). */
  canFlip: boolean;
  isFlipped: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onSkip: () => void;
  /** S is ignored when false (e.g. an MC answer is showing). Defaults to true. */
  canSkip?: boolean;
  /** Keys for a multiple-choice card: 1–N pick an option, Enter/Space go on. */
  multipleChoice?: MultipleChoiceShortcuts;
}

/** Whether a key press belongs to a text field or dialog rather than the study screen. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]'));
}

/** Space/Enter flips, 1–4 rate once flipped, S skips. On MC cards 1–N pick and Enter/Space go on. */
export function useStudyShortcuts({
  enabled,
  canFlip,
  isFlipped,
  onFlip,
  onRate,
  onSkip,
  canSkip = true,
  multipleChoice,
}: StudyShortcuts) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target)) return;
      // Let Enter/Space activate whichever button has focus
      const onButton = Boolean(target?.closest('button, a'));
      const isActivate = e.key === ' ' || e.key === 'Enter';

      if (multipleChoice && !canFlip) {
        if (multipleChoice.answered) {
          if (isActivate && !onButton) {
            e.preventDefault();
            multipleChoice.onNext();
          }
          return; // no picking again or skipping once answered
        }
        const index = Number(e.key) - 1;
        if (/^[1-9]$/.test(e.key) && index < multipleChoice.optionCount) {
          e.preventDefault();
          multipleChoice.onSelect(index);
          return;
        }
      }

      if (isActivate && canFlip && !onButton) {
        e.preventDefault();
        onFlip();
      } else if (isFlipped && canFlip && e.key in RATING_KEYS) {
        e.preventDefault();
        onRate(RATING_KEYS[e.key]);
      } else if ((e.key === 's' || e.key === 'S') && canSkip) {
        e.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, canFlip, isFlipped, onFlip, onRate, onSkip, canSkip, multipleChoice]);
}
