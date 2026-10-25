import { STORAGE_KEYS, getFromStorage, setToStorage } from './storage';
import type { FactDeck, TriviaCard, UserFact, UserFacts } from '../types';

export const EMPTY_FACTS: UserFacts = { facts: [], deletedIds: [], lastUpdated: '' };

export function getUserFacts(): UserFacts {
  return getFromStorage<UserFacts>(STORAGE_KEYS.USER_FACTS, EMPTY_FACTS);
}

function saveFacts(update: (facts: UserFacts) => UserFacts) {
  setToStorage(STORAGE_KEYS.USER_FACTS, update(getUserFacts()));
}

export interface NewFact {
  deck: FactDeck;
  category: string;
  question: string;
  answer?: string;
}

/** Save a fact. With an answer it's studied right away and checked later; without one it waits for research. */
export function addUserFact({ deck, category, question, answer }: NewFact, now = new Date().toISOString()): UserFact {
  const trimmedAnswer = answer?.trim();
  const fact: UserFact = {
    id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    deck,
    category,
    question: question.trim(),
    ...(trimmedAnswer ? { answer: trimmedAnswer } : {}),
    status: trimmedAnswer ? 'needs_check' : 'needs_answer',
    addedAt: now,
    updatedAt: now,
  };
  saveFacts(current => ({ ...current, facts: [...current.facts, fact], lastUpdated: now }));
  return fact;
}

export function deleteUserFact(id: string, now = new Date().toISOString()): void {
  saveFacts(current => ({
    facts: current.facts.filter(f => f.id !== id),
    deletedIds: [...new Set([...current.deletedIds, id])],
    lastUpdated: now,
  }));
}

/** Facts that have an answer, as study cards. Unchecked answers say so on the back. */
export function factsToCards(facts: UserFacts, deck: FactDeck): TriviaCard[] {
  return facts.facts
    .filter(f => f.deck === deck && f.answer)
    .map(f => ({
      id: f.id,
      type: 'trivia',
      category: f.category,
      front: f.question,
      back: f.answer! + (f.status === 'needs_check' ? '\n\n(Your answer, not yet fact-checked)' : f.note ? `\n\n${f.note}` : ''),
      isUserAdded: true,
    }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function normalize(value: unknown): UserFacts {
  if (!isRecord(value)) return EMPTY_FACTS;
  return {
    facts: (Array.isArray(value.facts) ? value.facts : [])
      .filter((f): f is UserFact => isRecord(f) && typeof f.id === 'string' && typeof f.question === 'string'),
    deletedIds: (Array.isArray(value.deletedIds) ? value.deletedIds : []).filter((id): id is string => typeof id === 'string'),
    lastUpdated: text(value.lastUpdated),
  };
}

/**
 * Merge two copies of the user's facts (this device and the cloud). Each fact
 * keeps its most recently edited copy, so an answer filled in by Claude isn't
 * lost to an older copy on another device. Deletions win.
 */
export function mergeFacts(local: UserFacts | undefined, remote: UserFacts | undefined): UserFacts {
  const l = normalize(local);
  const r = normalize(remote);
  const deletedIds = [...new Set([...l.deletedIds, ...r.deletedIds])];
  const deleted = new Set(deletedIds);
  const byId = new Map<string, UserFact>();
  for (const fact of [...l.facts, ...r.facts]) {
    const other = byId.get(fact.id);
    if (!other || text(fact.updatedAt) > text(other.updatedAt)) byId.set(fact.id, fact);
  }
  return {
    facts: [...byId.values()].filter(f => !deleted.has(f.id)).sort((a, b) => text(a.addedAt).localeCompare(text(b.addedAt))),
    deletedIds,
    lastUpdated: l.lastUpdated > r.lastUpdated ? l.lastUpdated : r.lastUpdated,
  };
}
