export interface WordMetadata {
  text: string;
  normalized: string;
  count: number;
  definition?: string;
  partOfSpeech?: string;
  phonetic?: string;
}

/** Extracts English words in first-seen order. It does not claim dictionary meaning. */
export function extractWords(text: string): WordMetadata[] {
  const matches = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) ?? [];
  const words = new Map<string, WordMetadata>();

  for (const textValue of matches) {
    const normalized = textValue.replace("’", "'").toLowerCase();
    const existing = words.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      words.set(normalized, { text: textValue, normalized, count: 1 });
    }
  }

  return [...words.values()];
}
