import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { nextBox, useAdaptiveTesting } from './useAdaptiveTesting';
import { MAX_ABILITY_HISTORY } from '../lib/merge';
import { RATING_VALUES, type FlashCard, type IRTProfile } from '../types';
import { STORAGE_KEYS, getFromStorage, getIncorrectCounts, getStudyStats, setToStorage } from '../lib/storage';

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
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // At ability 0 the easy card is best; at ability 3 the hard one would be
    const pair: FlashCard[] = [
      { id: 'easy', type: 'trivia', front: 'Q', back: 'A', category: 'Science', difficulty: 0 },
      { id: 'hard', type: 'trivia', front: 'Q', back: 'A', category: 'Science', difficulty: 3 },
    ];
    const { result } = render({ cards: pair });
    expect(result.current.currentCard!.id).toBe('easy');
    act(() => {
      // Simulates a cloud sync landing mid-card
      setToStorage<IRTProfile>(KEY, { ability: 3, cardHistory: {} }, 'remote');
    });
    expect(result.current.currentCard!.id).toBe('easy');

    // Once answered, the next pick uses the new ability
    act(() => result.current.skipCard());
    expect(result.current.currentCard!.id).toBe('hard');
  });

  it('records the open-recall difficulty estimate: a miss makes the card harder', () => {
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.again));
    // Elo step: 0 + 0.4 * (P(correct) = 0.5 - 0)
    expect(readProfile().cardHistory[id].estDifficulty).toBeCloseTo(0.2, 5);
  });
});

describe('nextBox', () => {
  it.each([
    // [box, rating, format, expected]
    [0, RATING_VALUES.again, 'open', 0],
    [4, RATING_VALUES.again, 'open', 0],
    [0, RATING_VALUES.hard, 'open', 1],
    [3, RATING_VALUES.hard, 'open', 3],
    [0, RATING_VALUES.good, 'open', 1],
    [5, RATING_VALUES.good, 'open', 5],
    [3, RATING_VALUES.easy, 'open', 5],
    [4, RATING_VALUES.easy, 'open', 5],
    [0, RATING_VALUES.good, 'mc', 1],
    [1, RATING_VALUES.easy, 'mc', 2],
    [2, RATING_VALUES.good, 'mc', 2],
    [4, RATING_VALUES.good, 'mc', 4],
    [1, RATING_VALUES.hard, 'mc', 1],
    [3, RATING_VALUES.again, 'mc', 0],
  ] as const)('box %i rated %i (%s) -> %i', (box, rating, format, expected) => {
    expect(nextBox(box, rating, format)).toBe(expected);
  });
});

describe('useAdaptiveTesting scheduling', () => {
  const at = (iso: string) => vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) });

  it('makes a card due at the start of the review day, not the exact minute', () => {
    at('2026-03-10T21:00:00-04:00'); // 9pm New York
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.good)); // box 0 -> 1: one day
    expect(readProfile().cardHistory[id].nextReviewDate).toBe(new Date('2026-03-11T00:00:00-04:00').toISOString());
  });

  it('schedules across the daylight-saving change by calendar day', () => {
    at('2026-10-30T12:00:00-04:00');
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 1, timesCorrect: 1, leitnerBox: 1 }])),
    });
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.rateCard(RATING_VALUES.good)); // box 1 -> 2: three days, over Nov 1
    // Midnight EST on Nov 2 is 05:00 UTC (it would be 04:00 under EDT)
    expect(readProfile().cardHistory[id].nextReviewDate).toBe('2026-11-02T05:00:00.000Z');
  });

  it('offers only due cards and counts them', () => {
    const future = new Date(Date.now() + 86400000 * 5).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: {
        a: { cardId: 'a', timesAnswered: 1, timesCorrect: 1, nextReviewDate: future },
        b: { cardId: 'b', timesAnswered: 1, timesCorrect: 1, nextReviewDate: past },
        c: { cardId: 'c', timesAnswered: 1, timesCorrect: 1, nextReviewDate: future },
        // d: never answered, so due
      },
    });
    const { result } = render();
    expect(result.current.dueCount).toBe(2);
    const seen: string[] = [];
    while (result.current.hasMoreCards) {
      seen.push(result.current.currentCard!.id);
      act(() => result.current.rateCard(RATING_VALUES.good));
    }
    expect(seen.sort()).toEqual(['b', 'd']);
    expect(result.current.isCaughtUp).toBe(true);
  });

  it('treats a card as due at exactly its review time', () => {
    at('2026-03-10T12:00:00Z');
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-03-10T12:00:00.000Z' }])),
    });
    expect(render().result.current.dueCount).toBe(4);
  });

  it('offers cards that are not due when ignoring the schedule (trouble drills)', () => {
    const future = new Date(Date.now() + 86400000 * 5).toISOString();
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 1, timesCorrect: 1, nextReviewDate: future }])),
    });
    const { result } = render({ ignoreSchedule: true });
    expect(result.current.hasMoreCards).toBe(true);
    expect(result.current.isCaughtUp).toBe(false);
  });

  it('re-checks what is due when the user returns to a caught-up tab', () => {
    at('2026-03-10T12:00:00Z');
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: Object.fromEntries(cards.map(c => [c.id, { cardId: c.id, timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-03-11T04:00:00.000Z' }])),
    });
    const { result } = render();
    expect(result.current.isCaughtUp).toBe(true);

    vi.setSystemTime(new Date('2026-03-11T09:00:00Z')); // the next morning
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(result.current.isCaughtUp).toBe(false);
    expect(result.current.dueCount).toBe(4);
  });
});

describe('useAdaptiveTesting multiple choice', () => {
  // Open recall is far too hard at ability 0, so MC is the more informative format
  const mcCard: FlashCard = {
    id: 'mc', type: 'trivia', front: 'Q', back: 'A', category: 'Science',
    options: ['x', 'y', 'z'], difficulty: 4, mcDifficulty: 0,
  };

  it('rates in MC format: MC counters move, open-recall counters do not, and the box is capped', () => {
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: { mc: { cardId: 'mc', timesAnswered: 3, timesCorrect: 2, leitnerBox: 2 } },
    });
    const { result } = render({ cards: [mcCard] });
    expect(result.current.currentFormat).toBe('mc');
    const before = new Date();
    act(() => result.current.rateCard(RATING_VALUES.good));

    const h = readProfile().cardHistory.mc;
    expect(h).toMatchObject({ timesAnswered: 3, timesCorrect: 2, mcTimesAnswered: 1, mcTimesCorrect: 1, leitnerBox: 2 });
    expect(h.estMcDifficulty).toBeLessThan(0); // answered correctly: easier
    expect(h.estDifficulty).toBeUndefined();
    // Box 2 interval (3 days), from the start of today
    const expected = new Date(before);
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() + 3);
    expect(h.nextReviewDate).toBe(expected.toISOString());
  });

  it('keeps a high box but schedules no further out than the MC cap', () => {
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: { mc: { cardId: 'mc', timesAnswered: 5, timesCorrect: 5, leitnerBox: 5 } },
    });
    const { result } = render({ cards: [mcCard] });
    act(() => result.current.rateCard(RATING_VALUES.easy));
    const h = readProfile().cardHistory.mc;
    expect(h.leitnerBox).toBe(5);
    const days = (new Date(h.nextReviewDate!).getTime() - Date.now()) / 86400000;
    expect(days).toBeLessThanOrEqual(3);
  });
});

describe('useAdaptiveTesting session details', () => {
  it('skipping excludes the card for the session without touching progress', () => {
    const { result } = render();
    const id = result.current.currentCard!.id;
    act(() => result.current.skipCard());
    expect(result.current.currentCard!.id).not.toBe(id);
    expect(result.current.session.cardsReviewed).toBe(0);
    expect(result.current.skippedCount).toBe(1);
    expect(readProfile()).toEqual({ ability: 0, cardHistory: {} });
  });

  it('reports skipped cards so the page can explain an empty session', () => {
    const { result } = render();
    for (let i = 0; i < cards.length; i++) act(() => result.current.skipCard());
    expect(result.current.hasMoreCards).toBe(false);
    expect(result.current.skippedCount).toBe(4);
    act(() => result.current.resetSession());
    expect(result.current.skippedCount).toBe(0);
    expect(result.current.hasMoreCards).toBe(true);
  });

  it('ignores a prediction made after the answer was shown', () => {
    const { result } = render();
    act(() => result.current.flipCard());
    act(() => result.current.flipCard()); // back to the question
    expect(result.current.answerSeen).toBe(true);
    act(() => result.current.recordPrediction('know'));
    expect(result.current.hasPrediction).toBe(false);
    act(() => result.current.rateCard(RATING_VALUES.good));
    expect(result.current.session.predictions.total).toBe(0);
    expect(result.current.answerSeen).toBe(false); // reset for the next card
  });

  it('trims ability history to the cap', () => {
    const history = Array.from({ length: MAX_ABILITY_HISTORY }, (_, i) => ({ date: new Date(2026, 0, 1, 0, i).toISOString(), ability: 0 }));
    setToStorage<IRTProfile>(KEY, { ability: 0, cardHistory: {}, abilityHistory: history });
    const { result } = render();
    act(() => result.current.rateCard(RATING_VALUES.good));
    const saved = readProfile().abilityHistory!;
    expect(saved).toHaveLength(MAX_ABILITY_HISTORY);
    expect(saved[0]).toEqual(history[1]);
  });

  it('upgrades a legacy profile with separate -mc entries on load', () => {
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: { 'a-mc': { cardId: 'a-mc', timesAnswered: 2, timesCorrect: 1, leitnerBox: 1 } },
    });
    render();
    expect(Object.keys(readProfile().cardHistory)).toEqual(['a']);
    expect(readProfile().cardHistory.a).toMatchObject({ mcTimesAnswered: 2, mcTimesCorrect: 1 });
  });

  it('a correct answer raises ability by the expected Fisher step', () => {
    const { result } = render();
    act(() => result.current.rateCard(RATING_VALUES.good));
    // Prior info 1 + item info 0.25 at P = 0.5; score 0.5 -> step 0.5 / 1.25
    expect(readProfile().ability).toBeCloseTo(0.4, 5);
    expect(readProfile().abilityInfo).toBeCloseTo(1.25, 5);
  });
});

// Each test below fails if a specific session rule is removed (found by mutation testing)
describe('useAdaptiveTesting rules that need their own check', () => {
  it('scores each prediction against the answer that followed it', () => {
    const { result } = render();
    act(() => result.current.recordPrediction('know'));
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(result.current.session.predictions).toEqual({ total: 1, correct: 0 });

    act(() => result.current.recordPrediction('unsure'));
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(result.current.session.predictions).toEqual({ total: 2, correct: 1 });
  });

  it('counts misses as misses in the lifetime stats', () => {
    const { result } = render();
    act(() => result.current.rateCard(RATING_VALUES.again));
    act(() => result.current.rateCard(RATING_VALUES.good));
    expect(getStudyStats()).toMatchObject({ totalCardsReviewed: 2, totalCorrect: 1, totalIncorrect: 1 });
  });

  it('does not add newly due cards while a session is under way', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-10T12:00:00Z') });
    const tomorrow = '2026-03-11T04:00:00.000Z';
    setToStorage<IRTProfile>(KEY, {
      ability: 0,
      cardHistory: {
        c: { cardId: 'c', timesAnswered: 1, timesCorrect: 1, nextReviewDate: tomorrow },
        d: { cardId: 'd', timesAnswered: 1, timesCorrect: 1, nextReviewDate: tomorrow },
      },
    });
    const { result } = render();
    expect(result.current.dueCount).toBe(2); // a and b are new
    act(() => result.current.rateCard(RATING_VALUES.good));

    vi.setSystemTime(new Date('2026-03-11T09:00:00Z'));
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(result.current.dueCount).toBe(1);
  });

  it('lets a card be rated again after the session is restarted', () => {
    const one = [cards[0]];
    const { result } = renderHook(() => useAdaptiveTesting({ cards: one, storageKey: KEY }));
    // "Again" keeps the card due right away, so the restarted session offers it again
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(result.current.hasMoreCards).toBe(false);

    act(() => result.current.resetSession());
    act(() => result.current.rateCard(RATING_VALUES.again));
    expect(result.current.session.cardsReviewed).toBe(1);
    expect(readProfile().cardHistory.a.timesAnswered).toBe(2);
  });
});

describe('correct-answer streak', () => {
  it('counts correct answers in a row and resets on a miss', () => {
    const one = [cards[0]];
    const { result } = renderHook(() => useAdaptiveTesting({ cards: one, storageKey: KEY, ignoreSchedule: true }));
    const streak = () => readProfile().cardHistory.a.correctStreak;
    const rate = (rating: (typeof RATING_VALUES)[keyof typeof RATING_VALUES]) => {
      act(() => result.current.rateCard(rating));
      act(() => result.current.resetSession());
    };
    rate(RATING_VALUES.good);
    rate(RATING_VALUES.hard);
    expect(streak()).toBe(2);
    rate(RATING_VALUES.again);
    expect(streak()).toBe(0);
  });
});
