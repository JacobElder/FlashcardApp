import type { ConfidencePrediction } from '../types';

interface ConfidenceButtonsProps {
  onPredict: (prediction: ConfidencePrediction) => void;
}

export function ConfidenceButtons({ onPredict }: ConfidenceButtonsProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      <p className="text-slate-400 text-sm text-center mb-3">
        Before you flip — how confident are you?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onPredict('know')}
          className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          I know this ✓
        </button>
        <button
          onClick={() => onPredict('unsure')}
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          Not sure ?
        </button>
      </div>
    </div>
  );
}
