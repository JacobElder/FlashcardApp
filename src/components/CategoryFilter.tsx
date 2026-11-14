import type { ReactNode } from 'react';

interface CategoryFilterProps {
  categories: string[];
  selected: string;
  onChange: (category: string) => void;
  /** A control shown before the category chips (e.g. the Trouble toggle). */
  leading?: ReactNode;
}

/** Category chips: one scrolling row on a phone, wrapped onto lines from `md` up. */
export function CategoryFilter({ categories, selected, onChange, leading }: CategoryFilterProps) {
  return (
    <div className="relative">
      <div className="overflow-x-auto md:overflow-visible pb-1">
        <div className="flex items-center gap-2 px-4 min-w-max md:min-w-0 md:flex-wrap md:justify-center">
          {leading}
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              aria-pressed={selected === cat}
              onClick={() => onChange(cat)}
              className={`min-h-11 md:min-h-9 text-sm px-3 rounded-full font-medium whitespace-nowrap transition-colors ${
                selected === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      {/* Fade at the right edge hints that the row scrolls */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-900 to-transparent md:hidden"
        aria-hidden="true"
      />
    </div>
  );
}
