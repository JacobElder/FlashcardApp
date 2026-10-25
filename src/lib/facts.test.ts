import { describe, it, expect } from 'vitest';
import { addUserFact, deleteUserFact, factsToCards, getUserFacts, mergeFacts } from './facts';
import type { UserFact, UserFacts } from '../types';

const fact = (id: string, updatedAt: string, extra: Partial<UserFact> = {}): UserFact => ({
  id, deck: 'trivia', category: 'History', question: id, status: 'needs_answer', addedAt: updatedAt, updatedAt, ...extra,
});

describe('user facts', () => {
  it('saves a fact with an answer as needing a check, and without one as needing an answer', () => {
    const answered = addUserFact({ deck: 'trivia', category: 'History', question: ' Who? ', answer: ' Augustus ' });
    const open = addUserFact({ deck: 'data-science', category: 'Statistics', question: 'What is a QQ plot?', answer: '  ' });
    expect(answered).toMatchObject({ question: 'Who?', answer: 'Augustus', status: 'needs_check' });
    expect(open.status).toBe('needs_answer');
    expect(open).not.toHaveProperty('answer');
    expect(getUserFacts().facts.map(f => f.id)).toEqual([answered.id, open.id]);

    deleteUserFact(answered.id);
    expect(getUserFacts().facts.map(f => f.id)).toEqual([open.id]);
    expect(getUserFacts().deletedIds).toEqual([answered.id]);
  });

  it('turns only this deck\'s answered facts into cards, flagging unchecked ones', () => {
    const facts: UserFacts = {
      facts: [
        fact('a', '1', { answer: 'A', status: 'needs_check' }),
        fact('b', '1', { answer: 'B', status: 'corrected', note: 'Fixed.' }),
        fact('c', '1'),
        fact('d', '1', { answer: 'D', status: 'verified', deck: 'data-science' }),
      ],
      deletedIds: [],
      lastUpdated: '1',
    };
    const cards = factsToCards(facts, 'trivia');
    expect(cards.map(c => c.id)).toEqual(['a', 'b']);
    expect(cards[0].back).toContain('not yet fact-checked');
    expect(cards[1].back).toBe('B\n\nFixed.');
    expect(cards[0]).toMatchObject({ type: 'trivia', category: 'History', front: 'a', isUserAdded: true });
  });

  it('merges per fact by most recent edit, and deletions win', () => {
    const local: UserFacts = { facts: [fact('a', '2026-01-02', { answer: 'mine', status: 'needs_check' }), fact('b', '2026-01-01')], deletedIds: [], lastUpdated: '2026-01-02' };
    const remote: UserFacts = { facts: [fact('a', '2026-01-03', { answer: 'checked', status: 'verified' }), fact('c', '2026-01-01')], deletedIds: ['b'], lastUpdated: '2026-01-03' };
    const merged = mergeFacts(local, remote);
    expect(merged.facts.map(f => f.id)).toEqual(['c', 'a']); // ordered by when each was added
    expect(merged.facts.find(f => f.id === 'a')?.status).toBe('verified');
    expect(merged.facts.some(f => f.id === 'b')).toBe(false);
    expect(merged.deletedIds).toEqual(['b']);
    expect(merged.lastUpdated).toBe('2026-01-03');
  });

  it('copes with missing or malformed copies', () => {
    expect(mergeFacts(undefined, undefined)).toEqual({ facts: [], deletedIds: [], lastUpdated: '' });
    const junk = { facts: [null, { id: 1 }, fact('x', '1')], deletedIds: [3, 'y'], lastUpdated: 5 } as unknown as UserFacts;
    expect(mergeFacts(junk, undefined)).toEqual({ facts: [fact('x', '1')], deletedIds: ['y'], lastUpdated: '' });
  });
});
