import { useId, useState, type ReactNode } from 'react';
import { ProgressBar } from './ProgressBar';

interface StudyHeaderProps {
  title: string;
  /** Consecutive study days; hidden when 0. */
  streak: number;
  masteryLevel: number;
  /** Buttons beside the title, e.g. "Add Word". */
  actions?: ReactNode;
  /** Always shown below the header (e.g. the category filter). */
  children?: ReactNode;
  /**
   * Stats and less-used tools. Always shown from the `sm` breakpoint up; on a
   * phone they're collapsed behind a toggle so the card and its rating buttons
   * fit on screen above the tab bar.
   */
  details?: ReactNode;
}

/** Shared top of a study screen: title, streak, mastery, and collapsible details. */
export function StudyHeader({ title, streak, masteryLevel, actions, children, details }: StudyHeaderProps) {
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();

  return (
    <>
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
          {/* tabIndex -1: focus moves here when the user switches to this tab */}
          <h1 tabIndex={-1} className="text-xl font-bold text-white focus:outline-none">{title}</h1>
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <div className="flex items-center gap-1 text-amber-400 text-sm font-semibold">
                <span aria-hidden="true">🔥</span>
                <span>{streak} day{streak !== 1 ? 's' : ''}<span className="hidden sm:inline"> streak</span></span>
              </div>
            )}
            {actions}
            {details && (
              <button
                type="button"
                onClick={() => setShowDetails(open => !open)}
                aria-expanded={showDetails}
                aria-controls={detailsId}
                className="sm:hidden min-h-11 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
              >
                {showDetails ? 'Hide stats' : 'Stats'}
              </button>
            )}
          </div>
        </div>
        <ProgressBar value={masteryLevel} label="Overall Mastery" showPercentage color="gradient" />
      </header>
      {children}
      {details && (
        <div id={detailsId} className={showDetails ? '' : 'hidden sm:block'}>
          {details}
        </div>
      )}
    </>
  );
}
