import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyWordsList } from './MyWordsList';
import type { VocabularyCard } from '../types';

const words: VocabularyCard[] = [
  { id: 'a', type: 'vocabulary', word: 'laconic', definition: 'terse', front: 'laconic', back: 'terse' },
  { id: 'b', type: 'vocabulary', word: 'sere', definition: 'dry', front: 'sere', back: 'dry' },
];

describe('MyWordsList', () => {
  it('deletes only after confirming', () => {
    const onDelete = vi.fn();
    render(<MyWordsList words={words} onEdit={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete laconic' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(words[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('cancels a delete', () => {
    const onDelete = vi.fn();
    render(<MyWordsList words={words} onEdit={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete sere' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete sere' })).toBeInTheDocument();
  });

  it('edits a word', () => {
    const onEdit = vi.fn();
    render(<MyWordsList words={words} onEdit={onEdit} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit sere' }));
    expect(onEdit).toHaveBeenCalledWith(words[1]);
  });
});
