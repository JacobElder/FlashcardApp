import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolvePendingWords, startPendingWordResolver } from './pendingWords';
import { lookupWord } from './dictionary';
import { getUserVocabulary, queuePendingWords, removePendingWord, resolvePendingWord } from './storage';
import { mergeVocabulary } from './merge';
import { splitWords } from '../components/QuickCapture';

function mockDictionary(entries: Record<string, { status: number; body?: unknown }>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const word = decodeURIComponent(String(input).split('/').pop()!);
    const { status, body } = entries[word] ?? { status: 404 };
    return new Response(JSON.stringify(body ?? {}), { status });
  });
}

const found = (definition: string) => ({
  status: 200,
  body: [{ meanings: [{ partOfSpeech: 'adjective', definitions: [{ definition, example: 'An example.' }] }] }],
});

afterEach(() => vi.restoreAllMocks());

describe('queuePendingWords', () => {
  it('queues new words and skips blanks and duplicates of the deck or queue', () => {
    expect(queuePendingWords(['Laconic', ' ', 'argot', 'laconic'], ['Argot'])).toEqual(['Laconic']);
    expect(queuePendingWords(['LACONIC', 'pellucid'], [])).toEqual(['pellucid']);
    expect(getUserVocabulary().pending?.map(p => p.word)).toEqual(['Laconic', 'pellucid']);
  });
});

describe('splitWords', () => {
  it('splits a pasted list on commas, semicolons, and newlines', () => {
    expect(splitWords('laconic, pellucid;\nsere\n\n')).toEqual(['laconic', 'pellucid', 'sere']);
  });
});

describe('resolvePendingWords', () => {
  it('turns found words into cards with the same id and flags missing ones', async () => {
    mockDictionary({ laconic: found('Using few words.') });
    queuePendingWords(['laconic', 'zzxq'], []);
    const [laconic] = getUserVocabulary().pending!;

    await resolvePendingWords();

    const vocab = getUserVocabulary();
    expect(vocab.words).toEqual([expect.objectContaining({
      id: laconic.id, word: 'laconic', definition: 'Using few words.', partOfSpeech: 'adjective', isUserAdded: true,
    })]);
    expect(vocab.pending).toEqual([expect.objectContaining({ word: 'zzxq', status: 'not_found' })]);
  });

  it('does not let one failing word hold up the words behind it', async () => {
    mockDictionary({ broken: { status: 500 }, laconic: found('Using few words.') });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    queuePendingWords(['broken', 'laconic'], []);

    await resolvePendingWords();

    expect(getUserVocabulary().words.map(w => w.word)).toEqual(['laconic']);
    expect(getUserVocabulary().pending).toEqual([expect.objectContaining({ word: 'broken', status: 'queued' })]);
  });

  it('waits before retrying a failed word, but retries at once when the device comes back online', async () => {
    const fetchSpy = mockDictionary({ laconic: { status: 500 } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    queuePendingWords(['laconic'], []);
    await resolvePendingWords();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await resolvePendingWords();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still backing off

    const stop = startPendingWordResolver();
    fetchSpy.mockClear();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    stop();
  });

  it('coalesces a call made while a run is in progress into one more pass', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await gate;
      return new Response(JSON.stringify([]), { status: 200 });
    });
    queuePendingWords(['one'], []);
    const first = resolvePendingWords();
    queuePendingWords(['two'], []);
    await resolvePendingWords(); // returns at once; the running pass picks 'two' up
    release();
    await first;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getUserVocabulary().pending?.map(p => p.status)).toEqual(['not_found', 'not_found']);
  });

  it('stops when the device goes offline', async () => {
    const fetchSpy = mockDictionary({});
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    queuePendingWords(['laconic'], []);
    await resolvePendingWords();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getUserVocabulary().pending?.[0].status).toBe('queued');
  });

  it('leaves words queued when the lookup fails, for a later retry', async () => {
    mockDictionary({ laconic: { status: 500 } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    queuePendingWords(['laconic'], []);

    await resolvePendingWords();

    expect(getUserVocabulary().words).toEqual([]);
    expect(getUserVocabulary().pending).toEqual([expect.objectContaining({ status: 'queued' })]);
  });
});

describe('manual resolution', () => {
  it('defines a pending word by hand, and removal is remembered as a deletion', () => {
    queuePendingWords(['zzxq', 'sere'], []);
    const [zzxq, sere] = getUserVocabulary().pending!;
    expect(resolvePendingWord(zzxq.id, { word: 'zzxq', definition: 'made up' })).toBe(true);
    expect(resolvePendingWord(zzxq.id, { word: 'zzxq', definition: 'again' })).toBe(false);
    removePendingWord(sere.id);

    const vocab = getUserVocabulary();
    expect(vocab.words.map(w => w.id)).toEqual([zzxq.id]);
    expect(vocab.pending).toEqual([]);
    expect(vocab.deletedIds).toContain(sere.id);
  });
});

describe('mergeVocabulary with pending words', () => {
  const pendingItem = (id: string, word: string) => ({ id, word, addedAt: '2026-01-01', status: 'queued' as const });

  it('unions pending words but drops ones resolved or deleted on either side', () => {
    const local = {
      words: [],
      pending: [pendingItem('p1', 'laconic'), pendingItem('p2', 'sere'), pendingItem('p3', 'argot')],
      deletedIds: ['p3'],
      lastUpdated: '2026-01-01',
    };
    const remote = {
      words: [{ id: 'p1', type: 'vocabulary' as const, word: 'laconic', definition: 'terse', front: 'laconic', back: 'terse' }],
      pending: [pendingItem('p4', 'pellucid')],
      deletedIds: [],
      lastUpdated: '2026-01-02',
    };
    const merged = mergeVocabulary(local, remote);
    expect(merged.words.map(w => w.id)).toEqual(['p1']);
    expect(merged.pending?.map(p => p.id).sort()).toEqual(['p2', 'p4']);
  });
});

describe('lookupWord', () => {
  it('returns null for an empty or definition-less 200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }));
    expect(await lookupWord('x')).toBeNull();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{ meanings: [{}] }]), { status: 200 }));
    expect(await lookupWord('x')).toBeNull();
  });

  it('throws on a server error or malformed JSON, so the word is retried', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(lookupWord('x')).rejects.toThrow('429');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(lookupWord('x')).rejects.toThrow();
  });

  it('omits an empty part of speech and example', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(
      [{ meanings: [{ partOfSpeech: '', definitions: [{ definition: 'd', example: '' }] }] }]
    ), { status: 200 }));
    expect(await lookupWord(' word ')).toEqual({ definition: 'd', partOfSpeech: undefined, example: undefined });
  });
});
