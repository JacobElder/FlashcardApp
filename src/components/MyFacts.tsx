import { useState } from 'react';
import { addUserFact, deleteUserFact } from '../lib/facts';
import type { FactDeck, FactStatus, UserFact } from '../types';

interface MyFactsProps {
  deck: FactDeck;
  /** This deck's facts. */
  facts: UserFact[];
  categories: string[];
  /** Pre-selected category for new facts. */
  defaultCategory: string;
}

const STATUS_LABEL: Record<FactStatus, { text: string; className: string }> = {
  needs_answer: { text: 'Waiting for an answer', className: 'text-amber-300' },
  needs_check: { text: 'Not yet fact-checked', className: 'text-sky-300' },
  verified: { text: 'Verified', className: 'text-emerald-400' },
  corrected: { text: 'Corrected', className: 'text-orange-300' },
};

const inputClass =
  'w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

/** Add facts to learn on the fly; Claude fills in or fact-checks answers later. */
export function MyFacts({ deck, facts, categories, defaultCategory }: MyFactsProps) {
  const [open, setOpen] = useState<'none' | 'add' | 'list'>('none');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [message, setMessage] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const waiting = facts.filter(f => f.status === 'needs_answer' || f.status === 'needs_check').length;

  const toggle = (panel: 'add' | 'list') => {
    setOpen(current => (current === panel ? 'none' : panel));
    setMessage('');
    if (panel === 'add') setCategory(defaultCategory);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const fact = addUserFact({ deck, category, question, answer });
    setMessage(
      fact.answer
        ? 'Saved and added to your deck. Ask Claude to check your facts and it will verify the answer.'
        : 'Saved. Ask Claude to check your facts and it will look up the answer.'
    );
    setQuestion('');
    setAnswer('');
  };

  return (
    <section className="border-b border-slate-800 px-4 py-3" aria-label="Your facts">
      <div className="flex justify-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => toggle('add')}
          aria-expanded={open === 'add'}
          className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          + Add a fact
        </button>
        <button
          type="button"
          onClick={() => toggle('list')}
          aria-expanded={open === 'list'}
          className="text-sm px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
        >
          Your facts ({facts.length}{waiting > 0 ? `, ${waiting} waiting` : ''})
        </button>
      </div>

      {open === 'add' && (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-3 space-y-2">
          <label className="block">
            <span className="text-xs text-slate-400">Question or thing to learn</span>
            <textarea
              value={question}
              onChange={e => { setQuestion(e.target.value); setMessage(''); }}
              rows={2}
              required
              placeholder="e.g. What does the Kelly criterion maximize?"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Answer (optional: leave blank and Claude will look it up)</span>
            <input
              type="text"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Your answer, to be fact-checked"
              className={inputClass}
            />
          </label>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="text-xs text-slate-400">Category</span>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button
              type="submit"
              disabled={!question.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {message && <p className="max-w-md mx-auto text-xs text-slate-400 mt-2" role="status">{message}</p>}

      {open === 'list' && (
        facts.length === 0 ? (
          <p className="text-center text-sm text-slate-400 mt-3">You haven't added any facts yet.</p>
        ) : (
          <ul className="max-w-md mx-auto mt-3 space-y-2">
            {[...facts].reverse().map(fact => (
              <li key={fact.id} className="bg-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">{fact.question}</p>
                    <p className="text-slate-300 text-xs mt-0.5">{fact.answer ?? '—'}</p>
                    <p className={`text-xs mt-0.5 ${STATUS_LABEL[fact.status].className}`}>
                      {STATUS_LABEL[fact.status].text} · {fact.category}
                    </p>
                    {fact.originalAnswer && (
                      <p className="text-slate-500 text-xs mt-0.5">You wrote: {fact.originalAnswer}</p>
                    )}
                    {fact.note && <p className="text-slate-400 text-xs mt-0.5">{fact.note}</p>}
                  </div>
                  {confirmingId === fact.id ? (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => { deleteUserFact(fact.id); setConfirmingId(null); }}
                        className="text-xs font-medium text-white bg-red-600 hover:bg-red-500 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="text-xs text-slate-300 px-2 py-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(fact.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 shrink-0"
                      aria-label={`Delete fact: ${fact.question}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
