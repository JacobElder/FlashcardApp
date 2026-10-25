import { describe, it, expect } from 'vitest';
import { triviaCards } from './triviaCards';
import { vocabularyCards } from './vocabularyCards';
import { dataScienceCards, DATA_SCIENCE_CATEGORIES } from './dataScienceCards';

const CATEGORIES = ['Geography', 'History', 'Science', 'Pop Culture', 'Sports', 'Literature', 'Arts', 'Food & Drink', 'Music', 'Film/TV'];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Category implied by each ID prefix. */
const PREFIX_CATEGORY: Record<string, string> = {
  geo: 'Geography', hist: 'History', sci: 'Science', pop: 'Pop Culture', sport: 'Sports',
  lit: 'Literature', art: 'Arts', food: 'Food & Drink', music: 'Music', film: 'Film/TV',
};
/** Imported batches whose IDs don't encode a category. IDs are never renamed: progress is keyed by them. */
const LEGACY_PREFIXES = /^(pub-batch|pub|nyc-pub)-\d+$/;

// Near-duplicate detection: share of meaningful words two questions have in common
const STOP_WORDS = new Set('the a an of in is was what which who whose whom to and by for on this that with as at from its it are be has had have did does do name called known'.split(' '));
const contentWords = (text: string) =>
  new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP_WORDS.has(w)));
function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}
const NEAR_DUPLICATE = 0.75;
/** Pairs that look alike but ask different things. */
const DISTINCT_PAIRS = new Set([
  'pop-80/pop-108', // best-selling game vs. console
  'pop-11/pop-80',
  'pop-11/pop-108',
  'sci-4/sci-84', // organ vs. organ system
  'sci-20/sci-88', // chromosomes vs. pairs
  'sport-2/sport-108', // soccer vs. rugby World Cup
  'sport-8/sport-86', // touchdown vs. safety
  'sci-67/nyc-pub-1573', // planets vs. gas giants
]);

describe.each([
  ['trivia', triviaCards],
  ['vocabulary', vocabularyCards],
  ['data science', dataScienceCards],
] as const)('%s deck', (_name, cards) => {
  it('has unique ids', () => {
    const ids = cards.map(c => c.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('has no duplicate questions', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const card of cards) {
      const key = normalize(card.front);
      if (seen.has(key)) duplicates.push(`${seen.get(key)} / ${card.id}`);
      seen.set(key, card.id);
    }
    expect(duplicates).toEqual([]);
  });

  it('has a non-empty question and answer on every card', () => {
    expect(cards.filter(c => !c.front.trim() || !c.back.trim()).map(c => c.id)).toEqual([]);
  });

  it('has valid multiple-choice options', () => {
    const bad = cards.filter(c => c.options && (
      c.options.length === 0 ||
      new Set(c.options).size !== c.options.length ||
      c.options.some(o => normalize(o) === normalize(c.back))
    ));
    expect(bad.map(c => c.id)).toEqual([]);
  });
});

describe('data science deck', () => {
  it('uses only its declared categories', () => {
    const allowed: readonly string[] = DATA_SCIENCE_CATEGORIES;
    expect(dataScienceCards.filter(c => !allowed.includes(c.category)).map(c => c.id)).toEqual([]);
  });

  it('uses ds-N ids that no other deck uses', () => {
    expect(dataScienceCards.filter(c => !/^ds-\d+$/.test(c.id)).map(c => c.id)).toEqual([]);
  });
});

describe('trivia deck', () => {
  it('uses only the core categories', () => {
    const invalid = triviaCards.filter(c => !CATEGORIES.includes(c.category));
    expect(invalid.map(c => `${c.id}: ${c.category}`)).toEqual([]);
  });
});

describe('trivia deck conventions', () => {
  it('files each card under the category its ID prefix names', () => {
    const mismatched = triviaCards.filter(card => {
      if (LEGACY_PREFIXES.test(card.id)) return false;
      const prefix = card.id.match(/^([a-z]+)-\d+$/)?.[1];
      return !prefix || PREFIX_CATEGORY[prefix] !== card.category;
    });
    expect(mismatched.map(c => `${c.id}: ${c.category}`)).toEqual([]);
  });

  it('has no near-duplicate questions', () => {
    const words = triviaCards.map(card => ({ id: card.id, words: contentWords(card.front) }));
    const pairs: string[] = [];
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const [a, b] = [words[i], words[j]];
        if (a.words.size < 2 || b.words.size < 2) continue;
        const key = `${a.id}/${b.id}`;
        if (overlap(a.words, b.words) >= NEAR_DUPLICATE && !DISTINCT_PAIRS.has(key)) pairs.push(key);
      }
    }
    expect(pairs).toEqual([]);
  });

  it('has no leading or trailing whitespace', () => {
    const untrimmed = triviaCards.filter(c =>
      [c.front, c.back, c.hint ?? '', ...(c.options ?? [])].some(text => text !== text.trim())
    );
    expect(untrimmed.map(c => c.id)).toEqual([]);
  });

  it('has IRT parameters in range wherever they are set', () => {
    const inRange = (value: number | undefined, min: number, max: number) =>
      value === undefined || (Number.isFinite(value) && value >= min && value <= max);
    const bad = triviaCards.filter(c =>
      !inRange(c.difficulty, -4, 4) || !inRange(c.mcDifficulty, -4, 4) ||
      !inRange(c.discrimination, 0.1, 4) || !inRange(c.mcDiscrimination, 0.1, 4)
    );
    expect(bad.map(c => c.id)).toEqual([]);
  });
});
