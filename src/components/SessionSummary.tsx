import type { StudySession } from '../types';
import { ProgressBar } from './ProgressBar';

interface SessionSummaryProps {
  session: StudySession;
  onReset: () => void;
}

export function SessionSummary({ session, onReset }: SessionSummaryProps) {
  const accuracy = session.cardsReviewed > 0
    ? Math.round((session.correctCount / session.cardsReviewed) * 100)
    : 0;

  const predictionAccuracy = session.predictions.total > 0
    ? Math.round((session.predictions.correct / session.predictions.total) * 100)
    : null;

  // Sort categories by total cards studied, descending
  const categoryEntries = Object.entries(session.categoryStats).sort(
    ([, a], [, b]) => b.total - a.total
  );

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🎉</div>
        <h2 className="text-2xl font-bold text-white">Session Complete!</h2>
        <p className="text-slate-400 mt-1">
          {session.cardsReviewed} cards reviewed
        </p>
      </div>

      {/* Overall accuracy */}
      <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-300 font-medium">Overall Accuracy</span>
          <span className="text-white font-bold text-lg">{accuracy}%</span>
        </div>
        <ProgressBar value={accuracy} color="gradient" />
        <div className="flex justify-between text-sm">
          <span className="text-emerald-400">✓ {session.correctCount} correct</span>
          <span className="text-red-400">✗ {session.incorrectCount} incorrect</span>
        </div>
      </div>

      {/* Prediction accuracy */}
      {predictionAccuracy !== null && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-300 font-medium">Prediction Accuracy</span>
            <span className="text-amber-400 font-bold">{predictionAccuracy}%</span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            You predicted correctly {session.predictions.correct} of {session.predictions.total} times
          </p>
        </div>
      )}

      {/* Category breakdown */}
      {categoryEntries.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-slate-300 font-medium">By Category</h3>
          {categoryEntries.map(([cat, stats]) => {
            const catAccuracy = stats.total > 0
              ? Math.round((stats.correct / stats.total) * 100)
              : 0;
            return (
              <div key={cat} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-300">{cat}</span>
                  <span className="text-slate-400">
                    {stats.correct}/{stats.total} ({catAccuracy}%)
                  </span>
                </div>
                <ProgressBar value={catAccuracy} color={catAccuracy >= 70 ? 'emerald' : 'amber'} />
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        Study Again
      </button>
    </div>
  );
}
