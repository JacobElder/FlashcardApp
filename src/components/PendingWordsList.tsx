import { useState } from 'react';
import type { PendingWord } from '../types';

interface PendingWordsListProps {
  pending: PendingWord[];
  onDefine: (item: PendingWord) => void;
  onRemove: (item: PendingWord) => void;
}

export function PendingWordsList({ pending, onDefine, onRemove }: PendingWordsListProps) {
  // Two-step remove, like My Words, so a stray tap doesn't lose a captured word
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (pending.length === 0) return null;

  return (
    <section className="max-w-md mx-auto px-4 pt-3" aria-label="Words waiting for definitions">
      <ul className="space-y-1.5">
        {pending.map(item => (
          <li key={item.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg pl-3 pr-1 text-sm">
            <span className="flex-1 min-w-0 truncate text-white">{item.word}</span>
            {confirmingId === item.id ? (
              <>
                <button
                  type="button"
                  onClick={() => { onRemove(item); setConfirmingId(null); }}
                  className="min-h-11 text-sm font-medium text-white bg-red-600 hover:bg-red-500 px-3 rounded"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className="min-h-11 text-sm text-slate-300 hover:text-white px-3"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {item.status === 'not_found' ? (
                  <>
                    <span className="text-xs text-amber-400">needs definition</span>
                    <button
                      type="button"
                      onClick={() => onDefine(item)}
                      className="min-h-11 text-sm text-blue-400 hover:text-blue-300 px-3"
                      aria-label={`Define ${item.word}`}
                    >
                      Define
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">looking up…</span>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmingId(item.id)}
                  className="min-h-11 min-w-11 text-base text-slate-400 hover:text-red-300"
                  aria-label={`Remove ${item.word}`}
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
