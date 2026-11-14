import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Analytics } from './Analytics';
import { STORAGE_KEYS, setToStorage } from '../lib/storage';

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
});
