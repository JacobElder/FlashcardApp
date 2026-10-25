import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AddWordModal } from './AddWordModal';

const lookup = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../lib/dictionary', () => ({ lookupWord: (word: string) => lookup.fn(word) }));

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
    expect(screen.getByText('"Ubiquitous" is already in your deck or waiting to be defined')).toBeInTheDocument();
  });

  it('requires a word and a definition', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add Word' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Word is required')).toBeInTheDocument();
    expect(screen.getByText('Definition is required')).toBeInTheDocument();
  });

  it('trims fields and drops blank optional ones on save', () => {
    const { onSave, onClose } = setup();
    fireEvent.change(screen.getByLabelText(/^Word/), { target: { value: '  sere ' } });
    fireEvent.change(screen.getByLabelText(/^Definition/), { target: { value: ' dry ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Word' }));
    expect(onSave).toHaveBeenCalledWith({ word: 'sere', definition: 'dry', partOfSpeech: undefined, example: undefined });
    expect(onClose).toHaveBeenCalled();
  });

  it('auto-fills the definition from the dictionary', async () => {
    lookup.fn.mockResolvedValueOnce({ definition: 'Using few words.', partOfSpeech: 'adjective', example: 'A laconic reply.' });
    setup({ initialWord: 'laconic' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' })));
    expect(screen.getByLabelText(/^Definition/)).toHaveValue('Using few words.');
    expect(screen.getByLabelText(/^Example/)).toHaveValue('A laconic reply.');
  });

  it('says so when the dictionary has no entry, and clears that when the word changes', async () => {
    lookup.fn.mockResolvedValueOnce(null);
    setup({ initialWord: 'zzxq' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' })));
    expect(screen.getByText('Could not find definition for this word.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Word/), { target: { value: 'zzxqq' } });
    expect(screen.queryByText('Could not find definition for this word.')).not.toBeInTheDocument();
  });

  it('only offers auto-fill once a word is entered', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Auto-fill' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Word/), { target: { value: 'sere' } });
    expect(screen.getByRole('button', { name: 'Auto-fill' })).toBeEnabled();
  });

  it('ignores a lookup that finishes after the dialog was closed and reopened', async () => {
    let resolve!: (entry: unknown) => void;
    lookup.fn.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const props = { onClose: vi.fn(), onSave: vi.fn(), existingWords: [] };
    const { rerender } = render(<AddWordModal isOpen initialWord="first" {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));

    rerender(<AddWordModal isOpen={false} initialWord="first" {...props} />);
    rerender(<AddWordModal isOpen initialWord="second" {...props} />);
    await act(async () => resolve({ definition: 'stale definition' }));

    expect(screen.getByLabelText(/^Word/)).toHaveValue('second');
    expect(screen.getByLabelText(/^Definition/)).toHaveValue('');
  });

  it("doesn't reject an edited word for matching its own name", () => {
    const { onSave } = setup({
      existingWords: [],
      initialData: { id: 'user-1', type: 'vocabulary', word: 'laconic', definition: 'terse', front: 'laconic', back: 'terse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onSave).toHaveBeenCalled();
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
