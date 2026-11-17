import { useState, useMemo } from 'react';
import { SkillChart } from '../components/SkillChart';
import { STORAGE_KEYS, resetStudyProgress } from '../lib/storage';
import { flushPush } from '../lib/sync';
import { useStorageValue } from '../hooks/useStorageValue';
import type { IRTProfile } from '../types';

const EMPTY_PROFILE: IRTProfile = { ability: 0, cardHistory: {} };

const DECKS = [
  { id: 'trivia', label: 'Trivia', key: STORAGE_KEYS.TRIVIA_PROGRESS },
  { id: 'vocabulary', label: 'Vocabulary', key: STORAGE_KEYS.VOCABULARY_PROGRESS },
  { id: 'data-science', label: 'Data Sci', key: STORAGE_KEYS.DATA_SCIENCE_PROGRESS },
] as const;
type DeckId = (typeof DECKS)[number]['id'];

export function Analytics() {
  const [activeDeck, setActiveDeck] = useState<DeckId>('trivia');

  const profileKey = DECKS.find(d => d.id === activeDeck)!.key;
  // Re-renders whenever the profile is written (studying, cloud sync, other tabs)
  const profile = useStorageValue<IRTProfile>(profileKey, EMPTY_PROFILE);

  const chartData = useMemo(() => {
    if (!profile.abilityHistory) return [];

    return profile.abilityHistory.map((entry, index) => ({
      step: index + 1,
      ability: Number(entry.ability.toFixed(2)),
      date: new Date(entry.date).toLocaleDateString()
    }));
  }, [profile.abilityHistory]);

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-20 pt-8 px-4">
      <div className="max-w-md mx-auto space-y-8">
        <header className="text-center">
          <h1 tabIndex={-1} className="text-3xl font-bold text-white mb-2 focus:outline-none">Analytics</h1>
          <p className="text-slate-400">How your Study Deck skill level is changing</p>
        </header>

        <div className="flex bg-slate-800 rounded-lg p-1" role="group" aria-label="Deck">
          {DECKS.map(deck => (
            <button
              key={deck.id}
              type="button"
              aria-pressed={activeDeck === deck.id}
              onClick={() => setActiveDeck(deck.id)}
              className={`flex-1 min-h-11 py-2 text-sm font-medium rounded-md transition-colors ${
                activeDeck === deck.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {deck.label}
            </button>
          ))}
        </div>

        <div className="bg-slate-800 rounded-xl p-6 shadow-xl border border-slate-700">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">Skill Level Over Time</h2>
          <p className="text-sm text-slate-400 mb-6">
            How your estimated skill level has moved over your most recent answers. 0 is average;
            higher means you're answering harder cards correctly.{' '}
            <abbr title="The ability estimate (θ) from item response theory" className="cursor-help">What's this?</abbr>
          </p>
          
          {chartData.length > 0 ? (
            <SkillChart data={chartData} />
          ) : (
            <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg">
              <p className="text-slate-400 text-center px-4">Not enough data to plot trajectory.<br/>Complete a few study sessions first!</p>
            </div>
          )}
        </div>

        <ResetProgress />
      </div>
    </div>
  );
}

/** Start all decks over, after a second tap to confirm. */
function ResetProgress() {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    resetStudyProgress();
    // Send the reset to the cloud now, then reload so open study sessions start fresh
    try {
      await flushPush();
    } finally {
      window.location.reload();
    }
  };

  return (
    <section className="bg-slate-800 rounded-xl p-6 border border-slate-700" aria-labelledby="reset-heading">
      <h2 id="reset-heading" className="text-lg font-semibold text-slate-200 mb-2">Start over</h2>
      <p className="text-sm text-slate-400 mb-4">
        Reset Trivia, Vocabulary and Data Sci to new: card schedules, skill levels, stats and streak, on
        every device. Words and facts you added are kept. This can't be undone.
      </p>
      {confirming ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void reset()}
            disabled={resetting}
            className="flex-1 min-h-11 rounded-lg bg-red-600 hover:bg-red-700 font-semibold disabled:opacity-50"
          >
            {resetting ? 'Resetting…' : 'Yes, reset everything'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={resetting}
            className="flex-1 min-h-11 rounded-lg bg-slate-700 hover:bg-slate-600 font-semibold"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full min-h-11 rounded-lg border border-red-500/60 text-red-300 hover:bg-red-500/10 font-semibold"
        >
          Reset all progress
        </button>
      )}
    </section>
  );
}
