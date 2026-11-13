/** Moves to the next card without rating this one; its schedule is left unchanged. */
export function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onSkip}
        className="px-5 py-2 rounded-full border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors"
        aria-keyshortcuts="S"
        title="Move on without rating (S)"
      >
        Skip to next card →
      </button>
    </div>
  );
}
