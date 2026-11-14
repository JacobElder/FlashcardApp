/** Moves to the next card without rating this one; its schedule is left unchanged. */
export function SkipButton({ onSkip, disabled = false }: { onSkip: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="min-h-11 px-5 py-2 rounded-full border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        aria-keyshortcuts="S"
        title={disabled ? 'Already answered: press Next' : 'Move on without rating (S)'}
      >
        Skip to next card →
      </button>
    </div>
  );
}
