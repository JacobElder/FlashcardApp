import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlashCard } from './FlashCard';
import { useMultipleChoice } from '../hooks/useMultipleChoice';
import type { FlashCard as FlashCardType } from '../types';

function McCard({ card, onAnswer = () => {}, onFlip = () => {} }: {
  card: FlashCardType; onAnswer?: (isCorrect: boolean) => void; onFlip?: () => void;
}) {
  const mc = useMultipleChoice(card, 'mc', onAnswer);
  return <FlashCard card={card} isFlipped={false} onFlip={onFlip} format="mc" multipleChoice={mc} />;
}

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

  it('reports a multiple-choice answer only when Next is pressed, with icon and spoken feedback', () => {
    const onAnswer = vi.fn();
    const mcCard = { ...mockCard, options: ['Lyon', 'Nice', 'Lille'] };
    render(<McCard card={mcCard} onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lyon' }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Incorrect — answer: Paris');
    expect(screen.getByRole('button', { name: 'Paris' })).toHaveTextContent('✓');
    expect(screen.getByRole('button', { name: 'Lyon' })).toHaveTextContent('✗');
    // Focus moves to Next so Enter/Space continue
    expect(screen.getByRole('button', { name: /Next/ })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it('says "Correct" for the right option', () => {
    const onAnswer = vi.fn();
    render(<McCard card={{ ...mockCard, options: ['Lyon', 'Nice', 'Lille'] }} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paris' }));
    expect(screen.getByRole('status')).toHaveTextContent(/^Correct$/);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onAnswer).toHaveBeenCalledWith(true);
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

describe('FlashCard interactions', () => {
  const card: FlashCardType = {
    id: 'q1', type: 'trivia', front: 'Largest planet?', back: 'Jupiter', category: 'Science',
    hint: 'Gas giant', options: ['Mars', 'Venus', 'Saturn'],
  };

  it('moves focus to "Show question" after flipping with "Show answer", so Space does not flip back', () => {
    const { rerender } = render(<FlashCard card={card} isFlipped={false} onFlip={() => {}} />);
    screen.getByRole('button', { name: 'Show answer' }).focus();
    rerender(<FlashCard card={card} isFlipped onFlip={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show question' })).toHaveFocus();

    rerender(<FlashCard card={card} isFlipped={false} onFlip={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show answer' })).toHaveFocus();
  });

  it('does not steal focus when the flip came from elsewhere', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { rerender } = render(<FlashCard card={card} isFlipped={false} onFlip={() => {}} />);
    rerender(<FlashCard card={card} isFlipped onFlip={() => {}} />);
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('does not flip when an MC card or one of its options is clicked', () => {
    const onFlip = vi.fn();
    render(<McCard card={card} onFlip={onFlip} />);
    fireEvent.click(screen.getByText('Largest planet?'));
    fireEvent.click(screen.getByRole('button', { name: 'Mars' }));
    expect(onFlip).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
  });

  it('keeps the first pick when an MC card is clicked twice', () => {
    const onAnswer = vi.fn();
    render(<McCard card={card} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jupiter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mars' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it('reveals the hint without flipping, and hides it again for the next card', () => {
    const onFlip = vi.fn();
    const { rerender } = render(<FlashCard card={card} isFlipped={false} onFlip={onFlip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Hint' }));
    expect(screen.getByText(/Gas giant/)).toBeInTheDocument();
    expect(onFlip).not.toHaveBeenCalled();

    rerender(<FlashCard card={{ ...card, id: 'q2', hint: 'Ringed' }} isFlipped={false} onFlip={onFlip} />);
    expect(screen.queryByText(/Ringed/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Hint' })).toBeInTheDocument();
  });
});
