import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAdaptiveTesting } from './useAdaptiveTesting';
import { RATING_VALUES, type FlashCard, type IRTProfile } from '../types';
import { STORAGE_KEYS, getFromStorage, getIncorrectCounts, setToStorage } from '../lib/storage';

const KEY = STORAGE_KEYS.TRIVIA_PROGRESS;
const cards: FlashCard[] = ['a', 'b', 'c', 'd'].map(id => ({
  id, type: 'trivia', front: `Q ${id}`, back: `A ${id}`, category: 'Science',
}));

const readProfile = () => getFromStorage<IRTProfile>(KEY, { ability: 0, cardHistory: {} });

function render(options: Partial<Parameters<typeof useAdaptiveTesting>[0]> = {}) {
  return renderHook(() => useAdaptiveTesting({ cards, storageKey: KEY, ...options }));
}

describe('useAdaptiveTesting', () => {
  it('ends the session after the session size', () => {
    const { result } = render({ sessionSize: 2 });
    act(() => result.current.rateCard(RATING_VALUES.good));
    act(() => result.current.rateCard(RATING_VALUES.good));
    expect(result.current.hasMoreCards).toBe(false);
    expect(result.current.session.cardsReviewed).toBe(2);
  });

  it('only offers due cards, and reports caught up when none are due', () => {
    const future = new Date(Date.now() + 86400000 * 5).toISOString();
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 1, timesCorrect: 1, leitnerBox: 2, nextReviewDate: future }])),
    });
    const { result } = render();
    expect(result.current.hasMoreCards).toBe(false);
    expect(result.current.isCaughtUp).toBe(true);

    act(() => result.current.studyAhead());
    expect(result.current.hasMoreCards).toBe(true);
  });

  it('treats "Hard" as correct without lengthening the interval', () => {
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 2, timesCorrect: 2, leitnerBox: 3 }])),
    });
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.hard));

    const history = readProfile().cardHistory[id];
    expect(history.leitnerBox).toBe(3);
    expect(history.timesCorrect).toBe(3);
    expect(result.current.session.correctCount).toBe(1);
    expect(getIncorrectCounts()[id]).toBeUndefined();
  });

  it('resets the box and counts a miss on "Again"', () => {
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(readProfile().cardHistory[id].leitnerBox).toBe(0);
    expect(getIncorrectCounts()[id]).toBe(1);
    expect(readProfile().ability).toBeLessThan(0);
  });

  it('ignores a second rating of the same card (double tap)', () => {
    const { result } = render();
    const rate = result.current.rateCard;
    act(() => {
      rate(RATING_VALUES.good);
      rate(RATING_VALUES.good);
    });
    expect(result.current.session.cardsReviewed).toBe(1);
    expect(readProfile().abilityHistory).toHaveLength(1);
  });

  it('scores an "unsure" prediction followed by a miss as a correct prediction', () => {
    const { result } = render();
    act(() => result.current.recordPrediction('unsure'));
    act(() => result.current.rateCard(RATING_VALUES.again));
    act(() => result.current.recordPrediction('know'));
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(result.current.session.predictions).toEqual({ total: 2, correct: 1 });
  });

  it('keeps the current card when the profile changes underneath it', () => {
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => {
      // Simulates a cloud pull landing mid-card
      setToStorage<IRTProfile>(KEY, { ability: 3, cardHistory: {} }, 'remote');
    });
    expect(result.current.currentCard!.id).toBe(id);
  });

  it('records calibration estimates for answered cards', () => {
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(readProfile().cardHistory[id].estDifficulty).toBeGreaterThan(0);
  });
});
