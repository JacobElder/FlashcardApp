import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

// Load the Apps Script file and pull out its pure functions
const code = readFileSync(path.join(process.cwd(), 'scripts/word-genius/WordGenius.gs'), 'utf8');
const sandbox = {};
vm.runInNewContext(`${code}\n;globalThis.exported = { wordFromSubject, htmlToText, parseWordGeniusEmail, wordGeniusId, addWordsToVocabulary, authenticate };`, sandbox);
const { wordFromSubject, htmlToText, parseWordGeniusEmail, wordGeniusId, addWordsToVocabulary, authenticate } = sandbox.exported;

const EMAIL_HTML = `<html><head><style>.x{color:red}</style></head><body>
  <a href="https://tracker.wordgenius.com/tc?d=abc"><h1>Tony</h1></a>
  <p>TOH-nee</p>
  <table><tr><td>Part of Speech</td><td>adjective</td></tr><tr><td>American English, late 19th century</td></tr></table>
  <p>Find out how <a href="https://x.example">to use &quot;Tony&quot; in a sentence</a>....</p>
  <div><b>Definition:</b> Tony</div>
  <div>(North American) Fashionable among wealthy or stylish people.<!--[if mso]><table><tr><td><![endif]--></div>
  <h2>Let&rsquo;s Play</h2><p>Test your vocab!</p>
  <p>What term describes a holiday from work?</p>
</body></html>`;

describe('Word Genius parsing', () => {
  it('reads the word from the subject', () => {
    expect(wordFromSubject('Word of the Day: Melomaniac')).toBe('Melomaniac');
    expect(wordFromSubject('Word of the Day: Trade-Last ')).toBe('Trade-Last');
    expect(wordFromSubject('8 comma rules to remember')).toBeNull();
  });

  it('turns the HTML body into plain text without tags, styles, entities or links', () => {
    const text = htmlToText(EMAIL_HTML);
    expect(text).not.toMatch(/<|-->|color:red|https?:|&quot;/);
    expect(text).toContain('to use "Tony" in a sentence');
  });

  it('parses the definition and part of speech from a Word of the Day email', () => {
    expect(parseWordGeniusEmail('Word of the Day: Tony', htmlToText(EMAIL_HTML))).toEqual({
      word: 'Tony',
      partOfSpeech: 'adjective',
      definition: '(North American) Fashionable among wealthy or stylish people.',
    });
  });

  it('returns just the word when the layout has changed, and null for other newsletters', () => {
    expect(parseWordGeniusEmail('Word of the Day: Zeal', 'Something completely different')).toEqual({ word: 'Zeal' });
    expect(parseWordGeniusEmail('Do you know your de facto from your de jure?', EMAIL_HTML)).toBeNull();
  });

  it('rejects an implausibly long "definition"', () => {
    const body = `Definition: Zeal ${'blah '.repeat(200)}`;
    expect(parseWordGeniusEmail('Word of the Day: Zeal', body)).toEqual({ word: 'Zeal' });
  });

  it('makes stable ids', () => {
    expect(wordGeniusId('Crinkum-crankum')).toBe('wg-crinkum-crankum');
    expect(wordGeniusId(' Élan ')).toBe('wg-elan');
  });
});

describe('addWordsToVocabulary', () => {
  const NOW = '2026-10-27T13:00:00.000Z';
  const vocab = () => ({
    words: [{ id: 'user-1', word: 'Laconic', definition: 'terse' }],
    pending: [{ id: 'p-1', word: 'sere', status: 'queued' }],
    deletedIds: ['wg-gone'],
    lastUpdated: '2026-01-01',
  });

  it('adds defined words as cards and undefined ones to the queue, skipping known and deleted words', () => {
    const { vocabulary, added, skipped } = addWordsToVocabulary(vocab(), [
      { word: 'Tony', partOfSpeech: 'adjective', definition: 'Fashionable.' },
      { word: 'Zeal' },
      { word: 'laconic', definition: 'x' },
      { word: 'Sere' },
      { word: 'Gone', definition: 'x' },
      { word: 'Tony', definition: 'again' },
    ], NOW);

    expect(added).toEqual(['Tony', 'Zeal']);
    expect(skipped).toEqual(['laconic', 'Sere', 'Gone', 'Tony']);
    expect(vocabulary.words[1]).toEqual({
      id: 'wg-tony', type: 'vocabulary', isUserAdded: true, word: 'Tony', definition: 'Fashionable.',
      partOfSpeech: 'adjective', front: 'Tony', back: 'Fashionable.', updatedAt: NOW,
    });
    expect(vocabulary.pending.map(p => [p.id, p.status])).toEqual([['p-1', 'queued'], ['wg-zeal', 'queued']]);
    expect(vocabulary.deletedIds).toEqual(['wg-gone']);
    expect(vocabulary.lastUpdated).toBe(NOW);
  });

  it('returns null when nothing is new, and handles an empty row', () => {
    expect(addWordsToVocabulary(vocab(), [{ word: 'Laconic' }], NOW).vocabulary).toBeNull();
    const { vocabulary } = addWordsToVocabulary({}, [{ word: 'Zeal', definition: 'Fervor.' }], NOW);
    expect(vocabulary.words.map(w => w.id)).toEqual(['wg-zeal']);
    expect(vocabulary.pending).toEqual([]);
    expect(vocabulary.deletedIds).toEqual([]);
  });
});

describe('authenticate', () => {
  const BASE = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  const session = { access_token: 'at', refresh_token: 'rotated', user: { id: 'u1' } };

  /** Fake fetchJson_: accepts only the given refresh token and password. */
  const fakeFetch = ({ token = 'good', password = 'pw' } = {}) => vi.fn((url, options) => {
    const body = JSON.parse(options.payload);
    expect(options.headers.apikey).toBe('anon');
    if (url.endsWith('grant_type=refresh_token') && body.refresh_token === token) return session;
    if (url.endsWith('grant_type=password') && body.password === password) return session;
    throw new Error('HTTP 400 from ' + url.split('?')[0] + ': invalid_grant');
  });

  it('exchanges the refresh token and saves the rotated one before using it', () => {
    const fetchJson = fakeFetch();
    const save = vi.fn();
    const auth = authenticate({ ...BASE, FLASHCARD_REFRESH_TOKEN: 'good', FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, fetchJson, save);

    expect(auth).toBe(session);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson.mock.calls[0][0]).toBe('https://x.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(JSON.parse(fetchJson.mock.calls[0][1].payload)).toEqual({ refresh_token: 'good' });
    expect(save).toHaveBeenCalledWith('rotated');
  });

  it('falls back to the password when the token is rejected, and logs why', () => {
    const fetchJson = fakeFetch();
    const save = vi.fn();
    const log = vi.fn();
    const auth = authenticate({ ...BASE, FLASHCARD_REFRESH_TOKEN: 'revoked', FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, fetchJson, save, log);

    expect(auth).toBe(session);
    expect(fetchJson.mock.calls[1][0]).toBe('https://x.supabase.co/auth/v1/token?grant_type=password');
    expect(save).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('invalid_grant'));
  });

  it('uses the password when there is no token, as before', () => {
    const fetchJson = fakeFetch();
    authenticate({ ...BASE, FLASHCARD_EMAIL: 'a@b.c', FLASHCARD_PASSWORD: 'pw' }, fetchJson, vi.fn());
    expect(JSON.parse(fetchJson.mock.calls[0][1].payload)).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  it('explains a rejected token with no password to fall back on, and missing credentials', () => {
    expect(() => authenticate({ ...BASE, FLASHCARD_REFRESH_TOKEN: 'revoked' }, fakeFetch(), vi.fn()))
      .toThrow(/FLASHCARD_REFRESH_TOKEN Script Property was rejected.*auth:login -- --print/);
    expect(() => authenticate({ ...BASE }, fakeFetch(), vi.fn())).toThrow(/Set the FLASHCARD_REFRESH_TOKEN Script Property/);
  });
});
