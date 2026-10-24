import type { PendingWord } from '../types';

interface PendingWordsListProps {
  pending: PendingWord[];
  onDefine: (item: PendingWord) => void;
  onRemove: (item: PendingWord) => void;
}

export function PendingWordsList({ pending, onDefine, onRemove }: PendingWordsListProps) {
  if (pending.length === 0) return null;

  return (
    <section className="max-w-md mx-auto px-4 pt-3" aria-label="Words waiting for definitions">
      <ul className="space-y-1.5">
        {pending.map(item => (
          <li key={item.id} className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-1.5 text-sm">
            <span className="flex-1 min-w-0 truncate text-white">{item.word}</span>
            {item.status === 'not_found' ? (
              <>
                <span className="text-xs text-amber-400">needs definition</span>
                <button
                  type="button"
                  onClick={() => onDefine(item)}
                  className="text-xs text-blue-400 hover:text-blue-300 px-1"
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
              onClick={() => onRemove(item)}
              className="text-xs text-slate-400 hover:text-red-300 px-1"
              aria-label={`Remove ${item.word}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
