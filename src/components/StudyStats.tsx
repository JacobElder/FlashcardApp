import type { ReactNode } from 'react';
import type { StudySession } from '../types';

interface StudyStatsProps {
  ability: number;
  totalCards: number;
  dueCount: number;
  reviewed: number;
  /** Extra controls at the end of the row (e.g. the Trouble or My Words toggle). */
  children?: ReactNode;
}

function Stat({ value, label, color, title }: { value: ReactNode; label: string; color: string; title?: string }) {
  return (
    <div className="text-center" title={title}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/** The row of deck numbers shared by every study screen. */
export function StudyStats({ ability, totalCards, dueCount, reviewed, children }: StudyStatsProps) {
  return (
    <div className="flex justify-center items-center gap-4 py-3 px-4 border-b border-slate-800 flex-wrap">
      <Stat
        value={ability.toFixed(2)}
        label="Skill level"
        color="text-purple-400"
        title="Estimated ability (θ) from item response theory: 0 is average, higher is stronger"
      />
      <Stat value={totalCards} label="Total Cards" color="text-slate-300" />
      <Stat value={dueCount} label="Due / New" color="text-sky-400" />
      <Stat value={reviewed} label="Reviewed" color="text-amber-400" />
      {children}
    </div>
  );
}

/** Running right/wrong tally (and prediction accuracy) under the card. */
export function SessionTally({ session }: { session: StudySession }) {
  if (session.cardsReviewed === 0) return null;
  const { correct, total } = session.predictions;
  return (
    <div className="flex justify-center gap-4 text-sm flex-wrap">
      <span className="text-emerald-400" title="Correct this session">✓ {session.correctCount}</span>
      <span className="text-red-400" title="Incorrect this session">✗ {session.incorrectCount}</span>
      {total > 0 && (
        <span className="text-amber-400" title="Prediction accuracy">
          🎯 {Math.round((correct / total) * 100)}%
        </span>
      )}
    </div>
  );
}
