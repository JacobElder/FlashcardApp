import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickCapture } from './QuickCapture';

const capture = (text: string) => {
  fireEvent.change(screen.getByLabelText('Capture a word to define later'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
};

describe('QuickCapture', () => {
  it('captures every word of a pasted list and clears the box', () => {
    const onCapture = vi.fn((words: string[]) => words);
    render(<QuickCapture onCapture={onCapture} />);
    capture('laconic, sere');
    expect(onCapture).toHaveBeenCalledWith(['laconic', 'sere']);
    expect(screen.getByRole('status')).toHaveTextContent('Saved laconic, sere. Definitions will be filled in automatically.');
    expect(screen.getByLabelText('Capture a word to define later')).toHaveValue('');
  });

  it('says when every word was already known', () => {
    render(<QuickCapture onCapture={() => []} />);
    capture('laconic');
    expect(screen.getByRole('status')).toHaveTextContent('Already in your deck.');
  });

  it('says how many were skipped when only some were new', () => {
    render(<QuickCapture onCapture={() => ['sere']} />);
    capture('laconic; sere, argot');
    expect(screen.getByRole('status')).toHaveTextContent('Saved sere. Its definition will be filled in automatically. (2 already in your deck.)');
  });

  it('focuses the box when opened from the home-screen shortcut', () => {
    render(<QuickCapture onCapture={() => []} autoFocus />);
    expect(screen.getByLabelText('Capture a word to define later')).toHaveFocus();
  });

  it('cannot submit blank input', () => {
    render(<QuickCapture onCapture={() => []} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
