const COMMON_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "get", "had", "has", "have", "he", "her", "here",
  "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its", "just", "me",
  "my", "no", "not", "of", "on", "or", "our", "she", "so", "some", "that", "the", "their",
  "them", "there", "they", "this", "to", "up", "us", "was", "we", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your"
]);

const USEFUL_PARTS_OF_SPEECH = new Set(["noun", "verb", "adjective", "adverb"]);

async function translateMeaning(word) {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ko`
    );
    if (!response.ok) return "";
    const data = await response.json();
    const translated = data?.responseData?.translatedText;
    if (typeof translated !== "string" || !translated.trim() || /mymemory warning/i.test(translated)) return "";
    return translated.trim();
  } catch {
    return "";
  }
}

async function lookupWords(payload) {
  const words = [...new Set((payload.text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2 && !COMMON_WORDS.has(word)))].slice(0, 8);
  const keyWords = [];
  for (const word of words) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) continue;
      const entries = await response.json();
      const meaning = entries[0]?.meanings?.find((item) =>
        item.definitions?.[0]?.definition && USEFUL_PARTS_OF_SPEECH.has(item.partOfSpeech)
      );
      const definition = meaning?.definitions?.[0]?.definition;
      if (!definition) continue;
      const korean = await translateMeaning(word);
      if (korean) keyWords.push({ word, meaning: korean });
      if (keyWords.length >= 5) break;
    } catch {
      // Continue when one word is unavailable.
    }
  }
  return { keyWords, skipped: false };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LOOKUP_WORDS") return false;

  lookupWords(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Word lookup failed."
      });
    });

  return true;
});
