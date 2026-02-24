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
    expect(screen.getByText('Tap to reveal answer')).toBeInTheDocument();
  });

  it('should render the back of the card when flipped', () => {
    render(<FlashCard card={mockCard} isFlipped={true} onFlip={() => {}} />);

    expect(screen.getByText('Paris')).toBeInTheDocument();
    expect(screen.getByText('Rate your recall below')).toBeInTheDocument();
  });

  it('should call onFlip when clicked', () => {
    const onFlip = vi.fn();
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={onFlip} />);

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('should call onFlip when Enter key is pressed', () => {
    const onFlip = vi.fn();
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={onFlip} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('should call onFlip when Space key is pressed', () => {
    const onFlip = vi.fn();
    render(<FlashCard card={mockCard} isFlipped={false} onFlip={onFlip} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: ' ' });

    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('should have correct aria-label', () => {
    const { rerender } = render(
      <FlashCard card={mockCard} isFlipped={false} onFlip={() => {}} />
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Show answer');

    rerender(<FlashCard card={mockCard} isFlipped={true} onFlip={() => {}} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Show question');
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
