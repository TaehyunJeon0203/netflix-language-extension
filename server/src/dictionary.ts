export interface DictionaryResult {
  definition: string;
  partOfSpeech?: string;
  phonetic?: string;
}

export type DictionaryLookup = (word: string) => Promise<DictionaryResult | null>;

/** Uses the free dictionaryapi.dev service; failures are intentionally non-fatal. */
export function createDictionaryLookup(): DictionaryLookup {
  return async (word) => {
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: AbortSignal.timeout(3_000) }
      );
      if (!response.ok) return null;
      const entries = (await response.json()) as Array<{
        phonetic?: string;
        meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>;
      }>;
      const meaning = entries[0]?.meanings?.find((item) => item.definitions?.[0]?.definition);
      const definition = meaning?.definitions?.[0]?.definition;
      return definition
        ? { definition, partOfSpeech: meaning.partOfSpeech, phonetic: entries[0]?.phonetic }
        : null;
    } catch {
      return null;
    }
  };
}
