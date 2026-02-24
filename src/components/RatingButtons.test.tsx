import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingButtons } from './RatingButtons';

describe('RatingButtons Component', () => {
  it('should render all four rating buttons', () => {
    render(<RatingButtons onRate={() => {}} />);

    expect(screen.getByText('Again')).toBeInTheDocument();
    expect(screen.getByText('Hard')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('should call onRate with correct value for Again button', () => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);

    fireEvent.click(screen.getByText('Again'));

    expect(onRate).toHaveBeenCalledWith(0);
  });

  it('should call onRate with correct value for Hard button', () => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);

    fireEvent.click(screen.getByText('Hard'));

    expect(onRate).toHaveBeenCalledWith(2);
  });

  it('should call onRate with correct value for Good button', () => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);

    fireEvent.click(screen.getByText('Good'));

    expect(onRate).toHaveBeenCalledWith(4);
  });

  it('should call onRate with correct value for Easy button', () => {
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);

    fireEvent.click(screen.getByText('Easy'));

    expect(onRate).toHaveBeenCalledWith(5);
  });

  it('should disable buttons when disabled prop is true', () => {
    render(<RatingButtons onRate={() => {}} disabled={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should show description text for each button', () => {
    render(<RatingButtons onRate={() => {}} />);

    expect(screen.getByText('Forgot completely')).toBeInTheDocument();
    expect(screen.getByText('Struggled to recall')).toBeInTheDocument();
    expect(screen.getByText('Recalled with effort')).toBeInTheDocument();
    expect(screen.getByText('Instant recall')).toBeInTheDocument();
  });
});
