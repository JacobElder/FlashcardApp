import type { Rating, RatingName } from '../types';
import { RATING_VALUES } from '../types';

interface RatingButtonsProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

interface RatingOption {
  name: RatingName;
  label: string;
  color: string;
  hoverColor: string;
  description: string;
}

const ratingOptions: RatingOption[] = [
  {
    name: 'again',
    label: 'Again',
    color: 'bg-red-500',
    hoverColor: 'hover:bg-red-600',
    description: 'Forgot completely',
  },
  {
    name: 'hard',
    label: 'Hard',
    color: 'bg-orange-500',
    hoverColor: 'hover:bg-orange-600',
    description: 'Struggled to recall',
  },
  {
    name: 'good',
    label: 'Good',
    color: 'bg-blue-500',
    hoverColor: 'hover:bg-blue-600',
    description: 'Recalled with effort',
  },
  {
    name: 'easy',
    label: 'Easy',
    color: 'bg-emerald-500',
    hoverColor: 'hover:bg-emerald-600',
    description: 'Instant recall',
  },
];

export function RatingButtons({ onRate, disabled = false }: RatingButtonsProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      <p className="text-slate-400 text-sm text-center mb-3">
        How well did you know this?
      </p>
      <div className="grid grid-cols-4 gap-2">
        {ratingOptions.map((option) => (
          <button
            key={option.name}
            onClick={() => onRate(RATING_VALUES[option.name])}
            disabled={disabled}
            className={`${option.color} ${option.hoverColor} text-white py-3 px-2 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-1`}
            aria-label={`${option.label}: ${option.description}`}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-1">
        {ratingOptions.map((option) => (
          <span key={option.name} className="text-slate-500 text-xs text-center">
            {option.description}
          </span>
        ))}
      </div>
    </div>
  );
}
