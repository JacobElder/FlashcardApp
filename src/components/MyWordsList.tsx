import { useState } from 'react';
import type { VocabularyCard } from '../types';

interface MyWordsListProps {
  words: VocabularyCard[];
  onEdit: (word: VocabularyCard) => void;
  onDelete: (word: VocabularyCard) => void;
}

export function MyWordsList({ words, onEdit, onDelete }: MyWordsListProps) {
  // Two-step delete instead of window.confirm, which blocks the page
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (words.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400 px-4 py-4 border-b border-slate-800">
        You haven't added any words yet.
      </p>
    );
  }

  return (
    <ul className="max-w-md mx-auto px-4 py-3 space-y-2 border-b border-slate-800" aria-label="My words">
      {words.map(word => (
        <li key={word.id} className="flex items-center gap-3 bg-slate-800 rounded-lg px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{word.word}</p>
            <p className="text-slate-400 text-xs truncate">{word.definition}</p>
          </div>
          {confirmingId === word.id ? (
            <>
              <button
                type="button"
                onClick={() => { onDelete(word); setConfirmingId(null); }}
                className="text-xs font-medium text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                className="text-xs text-slate-300 hover:text-white px-2 py-1"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onEdit(word)}
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
                aria-label={`Edit ${word.word}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(word.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                aria-label={`Delete ${word.word}`}
              >
                Delete
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
