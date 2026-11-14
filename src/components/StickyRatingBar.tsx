import type { Rating } from '../types';
import { RatingButtons } from './RatingButtons';

/**
 * Rating buttons that stick just above the fixed tab bar (4rem plus the home
 * indicator inset), so on a phone they're reachable without scrolling.
 */
export function StickyRatingBar({ onRate }: { onRate: (rating: Rating) => void }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 px-4 py-2 bg-slate-900/95 backdrop-blur-sm animate-fade-in">
      <RatingButtons onRate={onRate} />
    </div>
  );
}
