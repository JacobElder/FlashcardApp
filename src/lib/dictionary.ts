export interface DictionaryEntry {
  definition: string;
  partOfSpeech?: string;
  example?: string;
}

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

/**
 * Look up a word's first definition. Resolves to null when the dictionary has
 * no entry for it; throws on network or server errors, which are worth retrying.
 */
export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const res = await fetch(API_URL + encodeURIComponent(word.trim()));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dictionary lookup failed (${res.status})`);

  const data = await res.json();
  const meaning = data?.[0]?.meanings?.[0];
  const first = meaning?.definitions?.[0];
  if (!first?.definition) return null;
  return {
    definition: first.definition,
    partOfSpeech: meaning.partOfSpeech || undefined,
    example: first.example || undefined,
  };
}
