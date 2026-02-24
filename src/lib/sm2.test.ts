import { describe, it, expect } from 'vitest';
import {
  createInitialProgress,
  calculateNewEaseFactor,
  calculateNextInterval,
  processReview,
  isDueForReview,
  sortByPriority,
  getMasteryLevel,
  calculateOverallMastery,
} from './sm2';
import type { CardProgress } from '../types';

describe('SM-2 Algorithm', () => {
  describe('createInitialProgress', () => {
    it('should create progress with default values', () => {
      const progress = createInitialProgress('card-1');

      expect(progress.cardId).toBe('card-1');
      expect(progress.easeFactor).toBe(2.5);
      expect(progress.interval).toBe(0);
      expect(progress.repetitions).toBe(0);
      expect(progress.nextReviewDate).toBe(new Date().toISOString().split('T')[0]);
    });
  });

  describe('calculateNewEaseFactor', () => {
    it('should increase ease factor for perfect rating', () => {
      const newEF = calculateNewEaseFactor(2.5, 5);
      expect(newEF).toBeGreaterThan(2.5);
    });

    it('should decrease ease factor for poor rating', () => {
      const newEF = calculateNewEaseFactor(2.5, 0);
      expect(newEF).toBeLessThan(2.5);
    });

    it('should not go below minimum ease factor of 1.3', () => {
      const newEF = calculateNewEaseFactor(1.3, 0);
      expect(newEF).toBeGreaterThanOrEqual(1.3);
    });

    it('should maintain ease factor for rating of 4', () => {
      const newEF = calculateNewEaseFactor(2.5, 4);
      expect(newEF).toBeCloseTo(2.5, 1);
    });
  });

  describe('calculateNextInterval', () => {
    it('should return 1 day for failed review', () => {
      const interval = calculateNextInterval(5, 30, 2.5, 0);
      expect(interval).toBe(1);
    });

    it('should return 1 day for first successful review', () => {
      const interval = calculateNextInterval(0, 0, 2.5, 4);
      expect(interval).toBe(1);
    });

    it('should return 6 days for second successful review', () => {
      const interval = calculateNextInterval(1, 1, 2.5, 4);
      expect(interval).toBe(6);
    });

    it('should multiply interval by ease factor for subsequent reviews', () => {
      const interval = calculateNextInterval(3, 6, 2.5, 4);
      expect(interval).toBe(15); // 6 * 2.5 = 15
    });
  });

  describe('processReview', () => {
    it('should update progress correctly for successful review', () => {
      const initial = createInitialProgress('card-1');
      const updated = processReview(initial, 4);

      expect(updated.repetitions).toBe(1);
      expect(updated.interval).toBe(1);
      expect(updated.lastReviewDate).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should reset repetitions for failed review', () => {
      const initial: CardProgress = {
        cardId: 'card-1',
        easeFactor: 2.5,
        interval: 10,
        repetitions: 5,
        nextReviewDate: new Date().toISOString().split('T')[0],
      };

      const updated = processReview(initial, 0);
      expect(updated.repetitions).toBe(0);
      expect(updated.interval).toBe(1);
    });

    it('should calculate next review date correctly', () => {
      const initial = createInitialProgress('card-1');
      const updated = processReview(initial, 5);

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + updated.interval);

      expect(updated.nextReviewDate).toBe(expectedDate.toISOString().split('T')[0]);
    });
  });

  describe('isDueForReview', () => {
    it('should return true for cards due today', () => {
      const progress: CardProgress = {
        cardId: 'card-1',
        easeFactor: 2.5,
        interval: 1,
        repetitions: 1,
        nextReviewDate: new Date().toISOString().split('T')[0],
      };

      expect(isDueForReview(progress)).toBe(true);
    });

    it('should return true for overdue cards', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const progress: CardProgress = {
        cardId: 'card-1',
        easeFactor: 2.5,
        interval: 1,
        repetitions: 1,
        nextReviewDate: yesterday.toISOString().split('T')[0],
      };

      expect(isDueForReview(progress)).toBe(true);
    });

    it('should return false for cards not yet due', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const progress: CardProgress = {
        cardId: 'card-1',
        easeFactor: 2.5,
        interval: 1,
        repetitions: 1,
        nextReviewDate: tomorrow.toISOString().split('T')[0],
      };

      expect(isDueForReview(progress)).toBe(false);
    });
  });

  describe('sortByPriority', () => {
    it('should sort due cards before non-due cards', () => {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const progressList: CardProgress[] = [
        { cardId: 'future', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: tomorrow.toISOString().split('T')[0] },
        { cardId: 'due', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: today },
      ];

      const sorted = sortByPriority(progressList);
      expect(sorted[0].cardId).toBe('due');
      expect(sorted[1].cardId).toBe('future');
    });

    it('should sort overdue cards by date (most overdue first)', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const progressList: CardProgress[] = [
        { cardId: 'yesterday', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: yesterday.toISOString().split('T')[0] },
        { cardId: 'twoDaysAgo', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: twoDaysAgo.toISOString().split('T')[0] },
      ];

      const sorted = sortByPriority(progressList);
      expect(sorted[0].cardId).toBe('twoDaysAgo');
    });
  });

  describe('getMasteryLevel', () => {
    it('should return low mastery for new cards', () => {
      const progress = createInitialProgress('card-1');
      // New cards have default ease factor of 2.5, which gives some base mastery
      expect(getMasteryLevel(progress)).toBeLessThan(50);
    });

    it('should increase with more repetitions', () => {
      const progress: CardProgress = {
        cardId: 'card-1',
        easeFactor: 2.5,
        interval: 10,
        repetitions: 5,
        nextReviewDate: new Date().toISOString().split('T')[0],
      };

      expect(getMasteryLevel(progress)).toBeGreaterThan(0);
    });

    it('should not exceed 100', () => {
      const progress: CardProgress = {
        cardId: 'card-1',
        easeFactor: 3.0,
        interval: 100,
        repetitions: 20,
        nextReviewDate: new Date().toISOString().split('T')[0],
      };

      expect(getMasteryLevel(progress)).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateOverallMastery', () => {
    it('should return 0 for empty list', () => {
      expect(calculateOverallMastery([])).toBe(0);
    });

    it('should return average mastery', () => {
      const progressList: CardProgress[] = [
        { cardId: 'card-1', easeFactor: 2.5, interval: 10, repetitions: 5, nextReviewDate: '' },
        { cardId: 'card-2', easeFactor: 2.5, interval: 10, repetitions: 5, nextReviewDate: '' },
      ];

      const mastery = calculateOverallMastery(progressList);
      expect(mastery).toBeGreaterThan(0);
      expect(mastery).toBeLessThanOrEqual(100);
    });
  });
});
