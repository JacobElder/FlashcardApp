import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddWordModal } from './AddWordModal';

describe('AddWordModal', () => {
  const setup = (props: Partial<Parameters<typeof AddWordModal>[0]> = {}) => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<AddWordModal isOpen onClose={onClose} onSave={onSave} existingWords={['ubiquitous']} {...props} />);
    return { onSave, onClose };
  };

  it('is an accessible modal dialog with the first field focused', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Add New Word' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/^Word/)).toHaveFocus();
  });

  it('closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects a word already in the deck', () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText(/^Word/), { target: { value: 'Ubiquitous' } });
    fireEvent.change(screen.getByLabelText(/^Definition/), { target: { value: 'everywhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Word' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('"Ubiquitous" is already in your deck')).toBeInTheDocument();
  });

  it('prefills and saves when editing', () => {
    const { onSave } = setup({
      initialData: { id: 'user-1', type: 'vocabulary', word: 'laconic', definition: 'terse', front: 'laconic', back: 'terse' },
    });
    expect(screen.getByRole('dialog', { name: 'Edit Word' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Definition/), { target: { value: 'using few words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ word: 'laconic', definition: 'using few words' }));
  });
});
