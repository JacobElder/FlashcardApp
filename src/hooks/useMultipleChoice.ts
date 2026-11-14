import { useCallback, useMemo, useState } from 'react';
import type { CardFormat, FlashCard } from '../types';

export interface MultipleChoice {
  /** Options in display order (the answer shuffled in among the distractors). */
  options: string[];
  /** The option the user picked, or null while unanswered. */
  selected: string | null;
  select: (option: string) => void;
  /** Report the picked answer and move on. */
  next: () => void;
  /** Forget the pick without reporting it (e.g. the session was reset). */
  reset: () => void;
}

/**
 * State for a multiple-choice card: the shuffled options and the user's pick.
 * The result stays on screen until `next` is called, rather than on a timer.
 */
export function useMultipleChoice(
  card: FlashCard | null | undefined,
  format: CardFormat,
  onAnswer: (isCorrect: boolean) => void
): MultipleChoice {
  const active = format === 'mc' && Boolean(card?.options?.length);
  const key = active && card ? card.id : null;
  // Tied to the card it was made on, so a pick never carries over to another card
  const [pick, setPick] = useState<{ key: string; option: string } | null>(null);

  const options = useMemo(() => {
    if (!active || !card?.options) return [];
    const all = [...card.options, card.back];
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [active, card?.options, card?.back]);

  const selected = pick && pick.key === key ? pick.option : null;

  const select = useCallback((option: string) => {
    if (key === null) return;
    setPick(current => (current && current.key === key ? current : { key, option }));
  }, [key]);

  const next = useCallback(() => {
    if (selected === null || !card) return;
    setPick(null);
    onAnswer(selected === card.back);
  }, [selected, card, onAnswer]);

  const reset = useCallback(() => setPick(null), []);

  return { options, selected, select, next, reset };
}
