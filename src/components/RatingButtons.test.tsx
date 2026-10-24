import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingButtons } from './RatingButtons';
import { RATING_VALUES } from '../types';

describe('RatingButtons', () => {
  it.each([
    ['Again', RATING_VALUES.again],
    ['Hard', RATING_VALUES.hard],
    ['Good', RATING_VALUES.good],
    ['Easy', RATING_VALUES.easy],
  ])('"%s" is a labelled button that rates %i', (label, value) => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);
    // The accessible name includes the description, so screen readers hear what each rating means
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}: .+`) }));
    expect(onRate).toHaveBeenCalledExactlyOnceWith(value);
  });
});
