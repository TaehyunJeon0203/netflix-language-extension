async function lookupWords(payload) {
  const words = [...new Set((payload.text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [])
    .map((word) => word.toLowerCase()))].slice(0, 5);
  const keyWords = [];
  for (const word of words) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) continue;
      const entries = await response.json();
      const meaning = entries[0]?.meanings?.find((item) => item.definitions?.[0]?.definition);
      const definition = meaning?.definitions?.[0]?.definition;
      if (definition) keyWords.push({ word, meaning: definition });
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
