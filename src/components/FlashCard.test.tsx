import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlashCard } from './FlashCard';
import type { FlashCard as FlashCardType } from '../types';

describe('FlashCard Component', () => {
  const mockCard: FlashCardType = {
    id: 'test-1',
    type: 'trivia',
    front: 'What is the capital of France?',
    back: 'Paris',
    category: 'Geography',
  };

  it('should render the front of the card', () => {
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={() => {}} />);

    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument();
    // Category appears on both sides, so use getAllByText
    expect(screen.getAllByText('Geography')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
  });

  it('should render the back of the card when flipped', () => {
    render(<FlashCard card={mockCard} isFlipped={true} onFlip={() => {}} />);

    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Rate your recall below')).toBeInTheDocument();
  });

  it('should call onFlip when the card is clicked', () => {
    const onFlip = vi.fn();
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={onFlip} />);

    fireEvent.click(screen.getByText('What is the capital of France?'));

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('should flip via the Show answer button exactly once', () => {
    const onFlip = vi.fn();
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={onFlip} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('hides the face that is turned away from assistive tech', () => {
    const { rerender } = render(
      <FlashCard card={mockCard} isFlipped={false} onFlip={() => {}} />
    );

    expect(screen.getByRole('button', { name: 'Show answer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show question' })).not.toBeInTheDocument();

    rerender(<FlashCard card={mockCard} isFlipped={true} onFlip={() => {}} />);

    expect(screen.getByRole('button', { name: 'Show question' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
  });

  it('reports a multiple-choice answer after showing feedback', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const mcCard = { ...mockCard, options: ['Lyon', 'Nice', 'Lille'] };
    render(
      <FlashCard card={mcCard} isFlipped={false} onFlip={() => {}} format="mc" onMultipleChoiceSelect={onSelect} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paris' }));
    expect(onSelect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onSelect).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });

  it('cancels a pending multiple-choice answer when unmounted', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const mcCard = { ...mockCard, options: ['Lyon', 'Nice', 'Lille'] };
    const { unmount } = render(
      <FlashCard card={mcCard} isFlipped={false} onFlip={() => {}} format="mc" onMultipleChoiceSelect={onSelect} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lyon' }));
    unmount();
    vi.advanceTimersByTime(1000);
    expect(onSelect).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should render without category', () => {
    const cardWithoutCategory: FlashCardType = {
      id: 'test-2',
      type: 'vocabulary',
      front: 'Test word',
      back: 'Test definition',
    };

    render(<FlashCard card={cardWithoutCategory} isFlipped={false} onFlip={() => {}} />);

    expect(screen.getByText('Test word')).toBeInTheDocument();
  });
});
