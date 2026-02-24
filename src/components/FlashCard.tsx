import type { FlashCard as FlashCardType } from '../types';

interface FlashCardProps {
  card: FlashCardType;
  isFlipped: boolean;
  onFlip: () => void;
}

export function FlashCard({ card, isFlipped, onFlip }: FlashCardProps) {
  return (
    <div
      className="perspective-1000 w-full max-w-md mx-auto cursor-pointer"
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFlip();
        }
      }}
      aria-label={isFlipped ? 'Show question' : 'Show answer'}
    >
      <div
        className={`relative w-full min-h-64 transition-transform duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front of card */}
        <div className="absolute inset-0 backface-hidden">
          <div className="h-full bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl flex flex-col">
            {card.category && (
              <span className="text-blue-200 text-sm font-medium mb-2 uppercase tracking-wide">
                {card.category}
              </span>
            )}
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white text-xl md:text-2xl text-center font-medium leading-relaxed">
                {card.front}
              </p>
            </div>
            <p className="text-blue-200 text-sm text-center mt-4">
              Tap to reveal answer
            </p>
          </div>
        </div>

        {/* Back of card */}
        <div className="absolute inset-0 backface-hidden rotate-y-180">
          <div className="h-full bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl flex flex-col">
            {card.category && (
              <span className="text-emerald-200 text-sm font-medium mb-2 uppercase tracking-wide">
                {card.category}
              </span>
            )}
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white text-xl md:text-2xl text-center font-medium leading-relaxed">
                {card.back}
              </p>
            </div>
            <p className="text-emerald-200 text-sm text-center mt-4">
              Rate your recall below
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
