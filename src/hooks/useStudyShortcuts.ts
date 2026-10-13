import { useEffect } from 'react';
import type { Rating } from '../types';
import { RATING_VALUES } from '../types';

const RATING_KEYS: Record<string, Rating> = {
  '1': RATING_VALUES.again,
  '2': RATING_VALUES.hard,
  '3': RATING_VALUES.good,
  '4': RATING_VALUES.easy,
};

interface StudyShortcuts {
  enabled: boolean;
  /** Open-recall card is showing (MC cards are answered by clicking an option). */
  canFlip: boolean;
  isFlipped: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onSkip: () => void;
}

/** Space/Enter flips, 1–4 rate once flipped, S skips. */
export function useStudyShortcuts({ enabled, canFlip, isFlipped, onFlip, onRate, onSkip }: StudyShortcuts) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"]')) return;
      // Let Enter/Space activate whichever button has focus
      const onButton = Boolean(target?.closest('button, a'));

      if ((e.key === ' ' || e.key === 'Enter') && canFlip && !onButton) {
        e.preventDefault();
        onFlip();
      } else if (isFlipped && canFlip && e.key in RATING_KEYS) {
        e.preventDefault();
        onRate(RATING_KEYS[e.key]);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, canFlip, isFlipped, onFlip, onRate, onSkip]);
}
