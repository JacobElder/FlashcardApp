import { describe, it, expect } from 'vitest';
import {
  MAX_ABILITY,
  MIN_ABILITY,
  PRIOR_INFO,
  initialAbilityInfo,
  reviewDateFor,
  buildDifficultyPriors,
  calculateInformation,
  calculateProbability,
  chooseFormat,
  getItemParams,
  isDue,
  migrateProfile,
  selectNextCard,
  updateAbility,
  updateItemDifficulty,
} from './irt';
import type { FlashCard, IRTCardHistory } from '../types';
import { triviaCards } from '../data/triviaCards';

const card = (id: string, extra: Partial<FlashCard> = {}): FlashCard => ({
  id, type: 'trivia', front: id, back: id, ...extra,
});

describe('probability and information', () => {
  it('is 0.5 at ability = difficulty for 2PL', () => {
    expect(calculateProbability(1, 1, 1.5)).toBeCloseTo(0.5);
  });

  it('never drops below the guessing floor for 3PL', () => {
    expect(calculateProbability(-10, 4, 2, 0.25)).toBeGreaterThanOrEqual(0.25);
  });

  it('reduces to a^2 P (1 - P) without guessing', () => {
    const p = calculateProbability(0.3, -0.2, 1.2);
    expect(calculateInformation(0.3, -0.2, 1.2)).toBeCloseTo(1.44 * p * (1 - p));
  });

  it('gives less information when answers can be guessed', () => {
    expect(calculateInformation(0, 0, 1, 0.25)).toBeLessThan(calculateInformation(0, 0, 1, 0));
  });
});

describe('updateAbility', () => {
  const item = { difficulty: 0, discrimination: 1, guessing: 0 };

  it('shrinks the first answers toward the N(0, 1) prior mean', () => {
    // Without a prior the first step would be score / item info = 0.5 / 0.25 = 2
    const first = updateAbility({ ability: 0, info: PRIOR_INFO }, item, true);
    expect(first.ability).toBeCloseTo(0.5 / (PRIOR_INFO + 0.25));
    // Ten straight correct answers on average items stay well inside the range
    let estimate = { ability: 0, info: PRIOR_INFO };
    for (let i = 0; i < 10; i++) estimate = updateAbility(estimate, item, true);
    expect(estimate.ability).toBeLessThan(2.5);
  });

  it('moves up on a correct answer and down on a miss', () => {
    expect(updateAbility({ ability: 0, info: 1 }, item, true).ability).toBeGreaterThan(0);
    expect(updateAbility({ ability: 0, info: 1 }, item, false).ability).toBeLessThan(0);
  });

  it('takes smaller steps as information accumulates', () => {
    const early = updateAbility({ ability: 0, info: 1 }, item, true).ability;
    const late = updateAbility({ ability: 0, info: 40 }, item, true).ability;
    expect(late).toBeLessThan(early);
    expect(late).toBeGreaterThan(0);
  });

  it('settles instead of oscillating for a consistent learner', () => {
    // Learner who reliably knows items at difficulty <= 1 and misses harder ones
    let estimate = { ability: 0, info: 1 };
    const swings: number[] = [];
    for (let i = 0; i < 200; i++) {
      const difficulty = (i % 9) / 2 - 2; // -2 .. 2
      const before = estimate.ability;
      estimate = updateAbility(estimate, { difficulty, discrimination: 1, guessing: 0 }, difficulty <= 1);
      swings.push(Math.abs(estimate.ability - before));
    }
    expect(Math.max(...swings.slice(-20))).toBeLessThan(0.15);
    expect(estimate.ability).toBeGreaterThan(0.5);
  });

  it('stays within bounds', () => {
    let estimate = { ability: 3.9, info: 1 };
    for (let i = 0; i < 20; i++) estimate = updateAbility(estimate, { difficulty: 4, discrimination: 2, guessing: 0 }, true);
    expect(estimate.ability).toBeLessThanOrEqual(4);
  });
});

describe('updateItemDifficulty', () => {
  it('makes an item harder when missed and easier when answered', () => {
    const item = { difficulty: 0, discrimination: 1, guessing: 0 };
    expect(updateItemDifficulty(0, item, false, 0)).toBeGreaterThan(0);
    expect(updateItemDifficulty(0, item, true, 0)).toBeLessThan(0);
  });
});

describe('getItemParams', () => {
  it('prefers calibrated, then authored, then category prior difficulty', () => {
    const c = card('a', { category: 'Science', difficulty: 1 });
    expect(getItemParams(c, undefined, 'open').difficulty).toBe(1);
    expect(getItemParams(c, { cardId: 'a', timesAnswered: 3, timesCorrect: 0, estDifficulty: 2 }, 'open').difficulty).toBe(2);
    expect(getItemParams(card('b', { category: 'Science' }), undefined, 'open', { Science: 0.7 }).difficulty).toBe(0.7);
  });

  it('uses a guessing floor of 1 / number of choices for MC', () => {
    const c = card('a', { options: ['x', 'y', 'z'] });
    expect(getItemParams(c, undefined, 'mc').guessing).toBeCloseTo(0.25);
  });

  it('averages authored difficulty per category', () => {
    const priors = buildDifficultyPriors([
      card('a', { category: 'Art', difficulty: 1 }),
      card('b', { category: 'Art', difficulty: 2 }),
      card('c', { category: 'Art' }),
    ]);
    expect(priors).toEqual({ Art: 1.5 });
  });
});

describe('scheduling', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();

  it('serves due reviews before new cards, even more informative new ones', () => {
    const history = { review: { cardId: 'review', timesAnswered: 3, timesCorrect: 1, nextReviewDate: '2026-01-10T00:00:00Z', estDifficulty: 3.5 } };
    const cards = [card('new1', { difficulty: 0 }), card('review'), card('new2', { difficulty: 0 })];
    for (let i = 0; i < 20; i++) expect(selectNextCard(0, cards, history, {}, now)?.card.id).toBe('review');
  });

  it('orders due reviews by whole days overdue, then by information', () => {
    const history = {
      older: { cardId: 'older', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-05T00:00:00Z', estDifficulty: 3 },
      sameDayA: { cardId: 'sameDayA', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-10T00:00:00Z', estDifficulty: 3 },
      sameDayB: { cardId: 'sameDayB', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-10T06:00:00Z', estDifficulty: 0 },
    };
    const ids = ['sameDayA', 'sameDayB', 'older'];
    expect(selectNextCard(0, ids.map(id => card(id)), history, {}, now)?.card.id).toBe('older');
    expect(selectNextCard(0, ids.slice(0, 2).map(id => card(id)), history, {}, now)?.card.id).toBe('sameDayB');
  });

  it('offers not-yet-due cards (studying ahead) soonest first, after new cards', () => {
    const history = {
      soon: { cardId: 'soon', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-11T00:00:00Z' },
      later: { cardId: 'later', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-20T00:00:00Z' },
    };
    expect(selectNextCard(0, [card('later'), card('soon')], history, {}, now)?.card.id).toBe('soon');
    expect(selectNextCard(0, [card('later'), card('soon'), card('new')], history, {}, now)?.card.id).toBe('new');
  });

  it('treats new and past-due cards as due', () => {
    expect(isDue(undefined, now)).toBe(true);
    expect(isDue({ cardId: 'a', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-09T00:00:00Z' }, now)).toBe(true);
    expect(isDue({ cardId: 'a', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-11T00:00:00Z' }, now)).toBe(false);
  });

  it('prefers an overdue review over a not-yet-due card of equal information', () => {
    const history = {
      due: { cardId: 'due', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-01-01T00:00:00Z' },
      later: { cardId: 'later', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-02-01T00:00:00Z' },
    };
    for (let i = 0; i < 20; i++) {
      expect(selectNextCard(0, [card('later'), card('due')], history, {}, now)?.card.id).toBe('due');
    }
  });

  it('returns null with no cards', () => {
    expect(selectNextCard(0, [], {})).toBeNull();
  });
});

describe('migrateProfile', () => {
  it('folds legacy -mc entries into the card entry', () => {
    const migrated = migrateProfile({
      ability: 0,
      cardHistory: {
        a: { cardId: 'a', timesAnswered: 2, timesCorrect: 1, leitnerBox: 1 },
        'a-mc': { cardId: 'a-mc', timesAnswered: 3, timesCorrect: 3, leitnerBox: 3 },
        'b-mc': { cardId: 'b-mc', timesAnswered: 1, timesCorrect: 1, leitnerBox: 4, nextReviewDate: '2026-02-01' },
      },
    })!;
    expect(Object.keys(migrated.cardHistory).sort()).toEqual(['a', 'b']);
    expect(migrated.cardHistory.a).toMatchObject({ timesAnswered: 2, mcTimesAnswered: 3, mcTimesCorrect: 3, leitnerBox: 1 });
    expect(migrated.cardHistory.b).toMatchObject({ timesAnswered: 0, mcTimesAnswered: 1, leitnerBox: 2 });
  });

  it('returns null when there is nothing to migrate', () => {
    expect(migrateProfile({ ability: 0, cardHistory: {} })).toBeNull();
  });
});

describe('IRT robustness', () => {
  it('uses no guessing floor for an MC card without options, so ability never becomes NaN', () => {
    const card = { id: 'x', type: 'trivia' as const, front: 'Q', back: 'A' };
    expect(getItemParams(card, undefined, 'mc').guessing).toBe(0);
    const next = updateAbility({ ability: 0, info: 1 }, { difficulty: 0, discrimination: 1, guessing: 1 }, true);
    expect(next).toEqual({ ability: 0, info: 1 }); // degenerate item: estimate unchanged
  });

  it('keeps the item difficulty when the update is not finite', () => {
    expect(updateItemDifficulty(0, { difficulty: 1, discrimination: NaN, guessing: 0 }, true, 0)).toBe(1);
  });

  it('moves ability in the right direction and stays in range across a grid of items', () => {
    for (const ability of [-4, -2, 0, 2, 4]) {
      for (const difficulty of [-4, -1, 0, 1, 4]) {
        for (const discrimination of [0.3, 1, 2.5]) {
          for (const guessing of [0, 0.25]) {
            const item = { difficulty, discrimination, guessing };
            const p = calculateProbability(ability, difficulty, discrimination, guessing);
            expect(p).toBeGreaterThanOrEqual(guessing);
            expect(p).toBeLessThanOrEqual(1);
            const right = updateAbility({ ability, info: 1 }, item, true);
            const wrong = updateAbility({ ability, info: 1 }, item, false);
            expect(right.ability).toBeGreaterThanOrEqual(ability);
            expect(wrong.ability).toBeLessThanOrEqual(ability);
            for (const a of [right.ability, wrong.ability]) {
              expect(a).toBeGreaterThanOrEqual(MIN_ABILITY);
              expect(a).toBeLessThanOrEqual(MAX_ABILITY);
            }
            expect(right.info).toBeGreaterThanOrEqual(1); // an uninformative item adds ~0
          }
        }
      }
    }
  });

  it('starts a profile saved before abilityInfo existed from its answer count', () => {
    expect(initialAbilityInfo({ ability: 0, cardHistory: {} })).toBe(1);
    expect(initialAbilityInfo({
      ability: 0,
      cardHistory: { a: { cardId: 'a', timesAnswered: 3, timesCorrect: 1 }, b: { cardId: 'b', timesAnswered: 2, timesCorrect: 2 } },
    })).toBeCloseTo(2);
    expect(initialAbilityInfo({ ability: 0, abilityInfo: 7, cardHistory: {} })).toBe(7);
  });

  it('counts MC answers toward the starting information of a legacy profile', () => {
    expect(initialAbilityInfo({
      ability: 0,
      cardHistory: { a: { cardId: 'a', timesAnswered: 0, timesCorrect: 0, mcTimesAnswered: 10, mcTimesCorrect: 8 } },
    })).toBeCloseTo(2);
  });
});

describe('scheduling dates', () => {
  it('puts the review at local midnight N days later, or now for box 0', () => {
    const answered = new Date('2026-03-10T21:30:00-04:00');
    expect(reviewDateFor(answered, 0).toISOString()).toBe(answered.toISOString());
    expect(reviewDateFor(answered, 1).toISOString()).toBe(new Date('2026-03-11T00:00:00-04:00').toISOString());
    expect(reviewDateFor(answered, 7).toISOString()).toBe(new Date('2026-03-17T00:00:00-04:00').toISOString());
  });

  it('is due at exactly the review time, not a millisecond before', () => {
    const history = { cardId: 'a', timesAnswered: 1, timesCorrect: 1, nextReviewDate: '2026-03-10T12:00:00.000Z' };
    const t = new Date('2026-03-10T12:00:00.000Z').getTime();
    expect(isDue(history, t)).toBe(true);
    expect(isDue(history, t - 1)).toBe(false);
    expect(isDue(undefined, t)).toBe(true);
  });
});

describe('format selection', () => {
  const opts = { options: ['x', 'y', 'z'] };
  const seen = (extra: Partial<IRTCardHistory> = {}): IRTCardHistory =>
    ({ cardId: 'a', timesAnswered: 2, timesCorrect: 2, leitnerBox: 1, correctStreak: 2, ...extra });

  it('shows a new card with options as MC', () => {
    expect(chooseFormat(0, card('a', opts), undefined)).toBe('mc');
  });

  it('shows MC after a miss, and open recall once it is answered correctly', () => {
    expect(chooseFormat(0, card('a', opts), seen({ correctStreak: 0 }))).toBe('mc');
    expect(chooseFormat(0, card('a', opts), seen())).toBe('open');
  });

  it('shows MC while open recall is unlikely, below the MC box cap', () => {
    const hard = card('a', { ...opts, difficulty: 1.5 }); // P(open) at ability 0 is ~0.18
    expect(chooseFormat(0, hard, seen())).toBe('mc');
    expect(chooseFormat(0, hard, seen({ leitnerBox: 2 }))).toBe('open');
    expect(chooseFormat(2, hard, seen())).toBe('open');
  });

  it('selects MC for real trivia cards, which have no authored MC parameters', () => {
    const deck = triviaCards.filter(c => c.options?.length).slice(0, 50);
    expect(deck.length).toBe(50);
    expect(selectNextCard(0, deck, {})?.format).toBe('mc');
    expect(chooseFormat(MAX_ABILITY, deck[0], seen({ cardId: deck[0].id }))).toBe('open');
  });

  it('always uses open recall for a card without options', () => {
    const card = { id: 'a', type: 'trivia' as const, front: 'Q', back: 'A', difficulty: 4 };
    expect(selectNextCard(-4, [card], {})?.format).toBe('open');
  });
});

describe('migrateProfile review dates', () => {
  it('pulls a capped MC-only card in to no later than the cap interval', () => {
    const migrated = migrateProfile({
      ability: 0,
      cardHistory: {
        'a-mc': {
          cardId: 'a-mc', timesAnswered: 4, timesCorrect: 4, leitnerBox: 4,
          lastAnsweredDate: '2026-03-01T15:00:00.000Z', nextReviewDate: '2026-03-15T15:00:00.000Z',
        },
      },
    })!;
    expect(migrated.cardHistory.a.leitnerBox).toBe(2);
    expect(migrated.cardHistory.a.nextReviewDate).toBe(new Date('2026-03-04T00:00:00-05:00').toISOString());
  });

  it('leaves an MC review date inside the cap alone', () => {
    const migrated = migrateProfile({
      ability: 0,
      cardHistory: {
        'a-mc': { cardId: 'a-mc', timesAnswered: 1, timesCorrect: 1, leitnerBox: 1, lastAnsweredDate: '2026-03-01T15:00:00.000Z', nextReviewDate: '2026-03-02T15:00:00.000Z' },
      },
    })!;
    expect(migrated.cardHistory.a.nextReviewDate).toBe('2026-03-02T15:00:00.000Z');
  });
});

// Each test below fails if a specific scheduling rule is removed (found by mutation testing)
describe('scheduling rules that need their own check', () => {
  const item = { difficulty: 0, discrimination: 1, guessing: 0 };
  const now = new Date('2026-01-10T12:00:00Z').getTime();
  const answered = (cardId: string, nextReviewDate: string) =>
    ({ cardId, timesAnswered: 1, timesCorrect: 1, nextReviewDate });

  it('keeps moving ability by a minimum step after hundreds of answers', () => {
    // p = 0.5 at ability = difficulty, so the move is step * 0.5 with the 0.05 floor
    expect(updateAbility({ ability: 0, info: 1e6 }, item, true).ability).toBeCloseTo(0.025);
  });

  it('adjusts a card\'s difficulty less once it has many answers, but never stops', () => {
    const early = updateItemDifficulty(0, item, false, 0);
    const late = updateItemDifficulty(0, item, false, 50);
    expect(late).toBeLessThan(early);
    expect(late).toBeCloseTo(0.025); // floor of 0.05 * (p - 0) at p = 0.5
  });

  it('treats multiple choice as easier than open recall when not authored', () => {
    const c = card('a', { difficulty: 1, options: ['x', 'y', 'z'] });
    expect(getItemParams(c, undefined, 'mc').difficulty).toBeLessThan(getItemParams(c, undefined, 'open').difficulty);
  });

  it('ranks a not-yet-due card below a new card even when it would be more informative', () => {
    const cards = [card('notDue', { difficulty: 0 }), card('new', { difficulty: 2 })];
    const history = { notDue: answered('notDue', '2026-02-01T00:00:00Z') };
    for (let i = 0; i < 20; i++) expect(selectNextCard(0, cards, history, {}, now)?.card.id).toBe('new');
  });

  it('ranks a long-overdue card above a just-due one that would be slightly more informative', () => {
    const cards = [card('justDue', { difficulty: 0 }), card('longOverdue', { difficulty: 1.5 })];
    const history = {
      justDue: answered('justDue', '2026-01-10T12:00:00Z'),
      longOverdue: answered('longOverdue', '2025-12-26T12:00:00Z'), // 15 days overdue
    };
    for (let i = 0; i < 20; i++) expect(selectNextCard(0, cards, history, {}, now)?.card.id).toBe('longOverdue');
  });

  it('adds legacy MC answers to MC answers already on the card', () => {
    const migrated = migrateProfile({
      ability: 0,
      cardHistory: {
        a: { cardId: 'a', timesAnswered: 1, timesCorrect: 1, mcTimesAnswered: 2, mcTimesCorrect: 1 },
        'a-mc': { cardId: 'a-mc', timesAnswered: 3, timesCorrect: 2 },
      },
    })!;
    expect(migrated.cardHistory.a).toMatchObject({ mcTimesAnswered: 5, mcTimesCorrect: 3 });
  });
});
