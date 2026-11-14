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
 * The answer as shown among the MC options. A trailing note in parentheses
 * ("Lead (from Latin plumbum)") would mark the answer out from bare
 * distractors, so it's dropped unless the distractors carry notes too; the
 * full answer is shown once the user has picked.
 */
export function mcAnswerText(card: Pick<FlashCard, 'back' | 'options'>): string {
  if (card.options?.some(o => o.includes('('))) return card.back;
  const stripped = card.back.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return stripped.length > 0 ? stripped : card.back;
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
    const all = [...card.options, mcAnswerText(card)];
    // Fisher-Yates shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }, [active, card]);

  const selected = pick && pick.key === key ? pick.option : null;

  const select = useCallback((option: string) => {
    if (key === null) return;
    setPick(current => (current && current.key === key ? current : { key, option }));
  }, [key]);

  const next = useCallback(() => {
    if (selected === null || !card) return;
    setPick(null);
    onAnswer(selected === mcAnswerText(card));
  }, [selected, card, onAnswer]);

  const reset = useCallback(() => setPick(null), []);

  return { options, selected, select, next, reset };
}
