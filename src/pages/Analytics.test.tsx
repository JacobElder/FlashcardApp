import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const LineChart = ({ data }: { data: unknown[] }) => <div data-testid="chart">{data.length} points</div>;
  return { LineChart, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, ResponsiveContainer: Stub, ReferenceLine: Stub };
});

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
    expect(screen.getByRole('button', { name: 'Trivia Data' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vocabulary Data' }));
    expect(screen.getByRole('button', { name: 'Vocabulary Data' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chart')).toHaveTextContent('2 points');
  });
});
