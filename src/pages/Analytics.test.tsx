import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { Analytics } from './Analytics';
import { STORAGE_KEYS, getFromStorage, setToStorage } from '../lib/storage';

vi.mock('../lib/sync', () => ({ flushPush: vi.fn(async () => {}) }));

describe('Analytics', () => {
  it('plots the selected deck and switches between decks', () => {
    setToStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, {
      ability: 0.5,
      cardHistory: {},
      abilityHistory: [{ date: '2026-01-01', ability: 0.1 }, { date: '2026-01-02', ability: 0.5 }],
    });
    render(<Analytics />);
    expect(screen.getByRole('button', { name: 'Trivia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary' }));
    expect(screen.getByRole('button', { name: 'Vocabulary' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img', { name: /Skill level over 2 answers, from 0.1 to 0.5/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Data Sci' }));
    expect(screen.getByRole('button', { name: 'Data Sci' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();
  });

  it('resets all progress after a confirming second tap, keeping added words', async () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    setToStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, { ability: 1, cardHistory: { w: { cardId: 'w', timesAnswered: 1, timesCorrect: 1 } } });
    setToStorage(STORAGE_KEYS.STUDY_STATS, { totalCardsReviewed: 20, totalCorrect: 17, totalIncorrect: 3, lastStudyDate: '2026-11-16', streak: 2 });
    setToStorage(STORAGE_KEYS.USER_VOCABULARY, { words: [{ id: 'mine' }], deletedIds: [], lastUpdated: '' });
    render(<Analytics />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(getFromStorage(STORAGE_KEYS.STUDY_STATS, null)).toMatchObject({ totalCorrect: 17 });

    fireEvent.click(screen.getByRole('button', { name: 'Reset all progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reset everything' }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(getFromStorage(STORAGE_KEYS.VOCABULARY_PROGRESS, null)).toEqual({ ability: 0, cardHistory: {} });
    expect(getFromStorage(STORAGE_KEYS.STUDY_STATS, null)).toMatchObject({ totalCorrect: 0, streak: 0, progressResetAt: expect.any(String) });
    expect(getFromStorage(STORAGE_KEYS.USER_VOCABULARY, null)).toMatchObject({ words: [{ id: 'mine' }] });
  });
});
