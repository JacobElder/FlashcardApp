import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SessionSummary } from './SessionSummary';
import type { StudySession } from '../types';

const session = (overrides: Partial<StudySession> = {}): StudySession => ({
  cardsReviewed: 3,
  correctCount: 2,
  incorrectCount: 1,
  startTime: '2026-01-01T00:00:00Z',
  categoryStats: { Science: { correct: 2, total: 3 } },
  predictions: { total: 0, correct: 0 },
  ...overrides,
});

describe('SessionSummary', () => {
  it('shows rounded accuracy and starts again on request', () => {
    const onReset = vi.fn();
    render(<SessionSummary session={session()} onReset={onReset} />);
    expect(screen.getByText('3 cards reviewed')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument(); // 2/3
    fireEvent.click(screen.getByRole('button', { name: 'Study Again' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('hides prediction accuracy when no predictions were made, and shows it otherwise', () => {
    const { rerender } = render(<SessionSummary session={session()} onReset={() => {}} />);
    expect(screen.queryByText('Prediction Accuracy')).not.toBeInTheDocument();
    rerender(<SessionSummary session={session({ predictions: { total: 3, correct: 1 } })} onReset={() => {}} />);
    expect(screen.getByText('Prediction Accuracy')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText('You predicted correctly 1 of 3 times')).toBeInTheDocument();
  });

  it('breaks down by category only when there is more than one, most-studied first', () => {
    const { rerender, container } = render(<SessionSummary session={session()} onReset={() => {}} />);
    expect(screen.queryByText('By Category')).not.toBeInTheDocument();

    rerender(
      <SessionSummary
        session={session({ cardsReviewed: 5, categoryStats: { Arts: { correct: 1, total: 1 }, History: { correct: 3, total: 4 } } })}
        onReset={() => {}}
      />
    );
    const breakdown = within(screen.getByText('By Category').parentElement!);
    expect(breakdown.getByText('3/4 (75%)')).toBeInTheDocument();
    const order = [...container.querySelectorAll('h3 ~ div span:first-child')].map(el => el.textContent);
    expect(order).toEqual(['History', 'Arts']);
  });
});
