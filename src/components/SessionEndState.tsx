import type { ReactNode } from 'react';
import type { StudySession } from '../types';
import { EmptyState } from './EmptyState';
import { SessionSummary } from './SessionSummary';

interface SessionEndStateProps {
  session: StudySession;
  skippedCount: number;
  isCaughtUp: boolean;
  totalCards: number;
  onReset: () => void;
  onStudyAhead: () => void;
  /** Description for the "All Caught Up!" state. */
  caughtUpDescription: string;
  /** A deck-specific state checked before "caught up" (e.g. an empty trouble drill). */
  special?: ReactNode;
  /** Shown when the selection has no cards at all. */
  empty: ReactNode;
}

/** What a study screen shows once there's no card to study. */
export function SessionEndState({
  session,
  skippedCount,
  isCaughtUp,
  totalCards,
  onReset,
  onStudyAhead,
  caughtUpDescription,
  special,
  empty,
}: SessionEndStateProps) {
  if (session.cardsReviewed > 0) return <SessionSummary session={session} onReset={onReset} />;
  if (skippedCount > 0) {
    return (
      <EmptyState
        title="Nothing Left This Session"
        description="You skipped the remaining cards. Start over to see them again."
        icon="cards"
        action={{ label: 'Start Over', onClick: onReset }}
      />
    );
  }
  if (special) return <>{special}</>;
  if (isCaughtUp && totalCards > 0) {
    return (
      <EmptyState
        title="All Caught Up!"
        description={caughtUpDescription}
        icon="check"
        action={{ label: 'Study Ahead', onClick: onStudyAhead }}
      />
    );
  }
  return <>{empty}</>;
}
