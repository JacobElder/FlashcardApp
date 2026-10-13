import { describe, it, expect } from 'vitest';
import { triviaCards } from './triviaCards';
import { vocabularyCards } from './vocabularyCards';

const CATEGORIES = ['Geography', 'History', 'Science', 'Pop Culture', 'Sports', 'Literature', 'Arts', 'Food & Drink', 'Music', 'Film/TV'];
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe.each([
  ['trivia', triviaCards],
  ['vocabulary', vocabularyCards],
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

describe('trivia deck', () => {
  it('uses only the core categories', () => {
    const invalid = triviaCards.filter(c => !CATEGORIES.includes(c.category));
    expect(invalid.map(c => `${c.id}: ${c.category}`)).toEqual([]);
  });
});
