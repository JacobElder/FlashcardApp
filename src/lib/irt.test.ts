import { describe, it, expect } from 'vitest';
import {
  buildDifficultyPriors,
  calculateInformation,
  calculateProbability,
  getItemParams,
  isDue,
  migrateProfile,
  selectNextCard,
  updateAbility,
  updateItemDifficulty,
} from './irt';
import type { FlashCard } from '../types';

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
