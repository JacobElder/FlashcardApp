import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { IRTProfile } from '../types';

const deck = vi.hoisted(() => {
  const card = (id: string, category: string, extra: Record<string, unknown> = {}) => ({
    id, type: 'trivia' as const, category, front: `Question ${id}`, back: `Answer ${id}`, ...extra,
  });
  return { card, cards: [card('geo-1', 'Geography'), card('geo-2', 'Geography'), card('sci-1', 'Science')] };
});
// The page reads the array at render time, so a test can add a card before rendering
vi.mock('../data/triviaCards', () => ({ triviaCards: deck.cards }));

import { TriviaStudy } from './TriviaStudy';
import { STORAGE_KEYS, setToStorage } from '../lib/storage';

const future = () => new Date(Date.now() + 5 * 86400000).toISOString();
const notDue = (ids: string[]): IRTProfile => ({
  ability: 0,
  cardHistory: Object.fromEntries(ids.map(id => [id, { cardId: id, timesAnswered: 1, timesCorrect: 1, leitnerBox: 2, nextReviewDate: future() }])),
});

const reviewed = () => within(screen.getByText('Reviewed').parentElement!).getByText(/^\d+$/).textContent;
const question = () => screen.getByText(/^Question /).textContent!.replace('Question ', '');
const answerGood = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  fireEvent.click(screen.getByRole('button', { name: /^Good:/ }));
};

describe('TriviaStudy', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('asks for a confidence prediction, then offers ratings once the answer is shown', () => {
    render(<TriviaStudy isActive />);
    expect(screen.getByRole('button', { name: /I know this/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Good:/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByRole('button', { name: /^Good:/ })).toBeInTheDocument();

    // Going back to the question must not allow a prediction with the answer already seen
    fireEvent.click(screen.getByRole('button', { name: 'Show question' }));
    expect(screen.queryByRole('button', { name: /I know this/ })).not.toBeInTheDocument();
  });

  it('hides the prediction buttons once a prediction is made', () => {
    render(<TriviaStudy isActive />);
    fireEvent.click(screen.getByRole('button', { name: /Not sure/ }));
    expect(screen.queryByRole('button', { name: /I know this/ })).not.toBeInTheDocument();
  });

  it('moves to a new card after rating and shows the summary when the deck runs out', () => {
    render(<TriviaStudy isActive />);
    const first = question();
    answerGood();
    expect(reviewed()).toBe('1');
    expect(question()).not.toBe(first);
    answerGood();
    answerGood();

    expect(screen.getByRole('heading', { name: 'Session Complete!' })).toBeInTheDocument();
    expect(screen.getByText('3 cards reviewed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Study Again' }));
    expect(reviewed()).toBe('0');
  });

  it('studies only the chosen category, and re-selecting it keeps the session', () => {
    render(<TriviaStudy isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Geography' }));
    expect(screen.getByRole('button', { name: 'Geography' })).toHaveAttribute('aria-pressed', 'true');
    expect(question()).toMatch(/^geo-/);

    answerGood();
    expect(reviewed()).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Geography' }));
    expect(reviewed()).toBe('1');

    // Switching category starts a new session
    fireEvent.click(screen.getByRole('button', { name: 'Science' }));
    expect(reviewed()).toBe('0');
    expect(question()).toBe('sci-1');
  });

  it('says when everything is caught up and lets the user study ahead', () => {
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, notDue(['geo-1', 'geo-2', 'sci-1']));
    render(<TriviaStudy isActive />);
    expect(screen.getByText('All Caught Up!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Study Ahead' }));
    expect(screen.getByText(/^Question /)).toBeInTheDocument();
  });

  it('explains an empty trouble drill and goes back to all cards', () => {
    render(<TriviaStudy isActive />);
    fireEvent.click(screen.getByRole('button', { name: /Trouble/ }));
    expect(screen.getByText('No Trouble Cards Yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to All' }));
    expect(screen.getByRole('button', { name: /Trouble/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/^Question /)).toBeInTheDocument();
  });

  it('drills trouble cards even when they are not due, counting only the selected category', () => {
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, notDue(['geo-1', 'geo-2', 'sci-1']));
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { 'geo-2': 3, 'sci-1': 2, 'geo-1': 1 });
    render(<TriviaStudy isActive />);
    expect(screen.getByRole('button', { name: /Trouble/ })).toHaveTextContent('Trouble (2)');

    fireEvent.click(screen.getByRole('button', { name: 'Geography' }));
    expect(screen.getByRole('button', { name: /Trouble/ })).toHaveTextContent('Trouble (1)');

    fireEvent.click(screen.getByRole('button', { name: /Trouble/ }));
    expect(question()).toBe('geo-2');
    answerGood();
    expect(screen.getByRole('heading', { name: 'Session Complete!' })).toBeInTheDocument();
  });

  it('takes a card off the trouble list once it is answered correctly 3 times in a row', () => {
    const profile = notDue(['geo-1']);
    profile.cardHistory['geo-1'].correctStreak = 2;
    setToStorage(STORAGE_KEYS.TRIVIA_PROGRESS, profile);
    setToStorage(STORAGE_KEYS.INCORRECT_COUNTS, { 'geo-1': 2 });
    render(<TriviaStudy isActive />);
    expect(screen.getByRole('button', { name: /Trouble/ })).toHaveTextContent('Trouble (1)');

    fireEvent.click(screen.getByRole('button', { name: /Trouble/ }));
    expect(question()).toBe('geo-1');
    answerGood();
    expect(screen.getByRole('button', { name: /Trouble/ })).toHaveTextContent(/^⚠ Trouble$/);
  });

  it('explains a session where every remaining card was skipped', () => {
    render(<TriviaStudy isActive />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText('Nothing Left This Session')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start Over' }));
    expect(screen.getByText(/^Question /)).toBeInTheDocument();
  });

  it('answers with keyboard shortcuts only while the tab is active', () => {
    const { rerender } = render(<TriviaStudy isActive={false} />);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.queryByRole('button', { name: /^Good:/ })).not.toBeInTheDocument();

    rerender(<TriviaStudy isActive />);
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '3' });
    expect(reviewed()).toBe('1');
  });

  it('rates a multiple-choice answer after its feedback delay: right is Good, wrong is Again', () => {
    // Open recall is far too hard at ability 0, so the scheduler offers MC
    const mc = deck.card('art-1', 'Arts', { options: ['x', 'y', 'z'], difficulty: 4, mcDifficulty: 0 });
    deck.cards.push(mc);
    try {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      render(<TriviaStudy isActive />);
      fireEvent.click(screen.getByRole('button', { name: 'Arts' }));
      expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'x' })); // wrong
      expect(reviewed()).toBe('0'); // feedback first
      act(() => { vi.advanceTimersByTime(1000); });
      expect(reviewed()).toBe('1');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.INCORRECT_COUNTS)!)).toEqual({ 'art-1': 1 });
    } finally {
      deck.cards.pop();
    }
  });
});
