import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const deck = vi.hoisted(() => ({
  cards: [
    { id: 'v-1', type: 'vocabulary' as const, word: 'ubiquitous', definition: 'everywhere', front: 'ubiquitous', back: 'everywhere' },
  ],
}));
vi.mock('../data/vocabularyCards', () => ({ vocabularyCards: deck.cards }));
vi.mock('../lib/dictionary', () => ({ lookupWord: vi.fn(async () => null) }));

import { VocabularyStudy } from './VocabularyStudy';
import { getUserVocabulary, markPendingNotFound, queuePendingWords, setUserVocabulary } from '../lib/storage';

const pendingList = () => within(screen.getByRole('region', { name: 'Words waiting for definitions' }));

function defineDialog() {
  return within(screen.getByRole('dialog'));
}

describe('VocabularyStudy', () => {
  it('captures a word into the waiting list', () => {
    render(<VocabularyStudy isActive />);
    fireEvent.change(screen.getByLabelText('Capture a word to define later'), { target: { value: 'laconic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(pendingList().getByText('laconic')).toBeInTheDocument();
    expect(pendingList().getByText('looking up…')).toBeInTheDocument();
  });

  it('does not study a user word twice when it duplicates a bundled card', () => {
    setUserVocabulary({
      words: [
        { id: 'wg-ubiquitous', type: 'vocabulary', word: 'Ubiquitous', definition: 'everywhere', front: 'Ubiquitous', back: 'everywhere' },
        { id: 'wg-zeal', type: 'vocabulary', word: 'Zeal', definition: 'fervor', front: 'Zeal', back: 'fervor' },
      ],
      deletedIds: [],
      lastUpdated: '2026-01-01',
    });
    render(<VocabularyStudy isActive />);
    expect(within(screen.getByText('Total Cards').parentElement!).getByText(/^\d+$/)).toHaveTextContent('2');
  });

  it('does not capture a word that is already a card', () => {
    render(<VocabularyStudy isActive />);
    fireEvent.change(screen.getByLabelText('Capture a word to define later'), { target: { value: 'Ubiquitous' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent('Already in your deck.');
  });

  it('defines a word the dictionary lacked: same id, out of the queue, into My Words', () => {
    queuePendingWords(['zzxq'], []);
    const [item] = getUserVocabulary().pending!;
    markPendingNotFound(item.id);
    render(<VocabularyStudy isActive />);

    fireEvent.click(pendingList().getByRole('button', { name: 'Define zzxq' }));
    expect(defineDialog().getByLabelText(/^Word/)).toHaveValue('zzxq');
    fireEvent.change(defineDialog().getByLabelText(/^Definition/), { target: { value: 'a made-up word' } });
    fireEvent.click(defineDialog().getByRole('button', { name: 'Add Word' }));

    expect(screen.queryByRole('region', { name: 'Words waiting for definitions' })).not.toBeInTheDocument();
    expect(getUserVocabulary().words).toEqual([expect.objectContaining({ id: item.id, word: 'zzxq', definition: 'a made-up word' })]);
    fireEvent.click(screen.getByRole('button', { name: /My Words/ }));
    expect(within(screen.getByRole('list', { name: 'My words' })).getByText('zzxq')).toBeInTheDocument();
  });

  it('will not rename a word being defined to another waiting word', () => {
    queuePendingWords(['teh', 'sere'], []);
    const [teh] = getUserVocabulary().pending!;
    markPendingNotFound(teh.id);
    render(<VocabularyStudy isActive />);

    fireEvent.click(pendingList().getByRole('button', { name: 'Define teh' }));
    fireEvent.change(defineDialog().getByLabelText(/^Word/), { target: { value: 'Sere' } });
    fireEvent.change(defineDialog().getByLabelText(/^Definition/), { target: { value: 'dry' } });
    fireEvent.click(defineDialog().getByRole('button', { name: 'Add Word' }));
    expect(defineDialog().getByText(/already in your deck or waiting to be defined/)).toBeInTheDocument();
    expect(getUserVocabulary().words).toEqual([]);
  });

  it('removes a waiting word and remembers the removal for sync', () => {
    queuePendingWords(['laconic'], []);
    const [item] = getUserVocabulary().pending!;
    render(<VocabularyStudy isActive />);
    fireEvent.click(pendingList().getByRole('button', { name: 'Remove laconic' }));
    expect(getUserVocabulary().pending).toEqual([]);
    expect(getUserVocabulary().deletedIds).toContain(item.id);
  });

  it('edits a word without tripping over its own name, and deletes it', () => {
    render(<VocabularyStudy isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Word' }));
    fireEvent.change(defineDialog().getByLabelText(/^Word/), { target: { value: 'sere' } });
    fireEvent.change(defineDialog().getByLabelText(/^Definition/), { target: { value: 'dry' } });
    fireEvent.click(defineDialog().getByRole('button', { name: 'Add Word' }));

    fireEvent.click(screen.getByRole('button', { name: /My Words/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit sere' }));
    fireEvent.change(defineDialog().getByLabelText(/^Definition/), { target: { value: 'withered' } });
    fireEvent.click(defineDialog().getByRole('button', { name: 'Save Changes' }));
    expect(getUserVocabulary().words[0]).toMatchObject({ word: 'sere', definition: 'withered' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete sere' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(getUserVocabulary().words).toEqual([]);
  });

  it('pauses study shortcuts while the add-word dialog is open', () => {
    render(<VocabularyStudy isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Word' }));
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.click(defineDialog().getByRole('button', { name: 'Close dialog' }));
    // The bundled word was not skipped
    expect(screen.getByText('ubiquitous')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 's' });
    expect(screen.getByText('Nothing Left This Session')).toBeInTheDocument();
  });

  it('offers to add a first word when the deck is empty', () => {
    const saved = deck.cards.splice(0);
    try {
      render(<VocabularyStudy isActive />);
      expect(screen.getByText('No Cards Yet')).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Add Word' }));
      expect(screen.getByRole('dialog', { name: 'Add New Word' })).toBeInTheDocument();
    } finally {
      deck.cards.push(...saved);
    }
  });
});
