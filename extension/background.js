const STORAGE_KEY = "backendUrl";

function normalizeBackendUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("The configured backend URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The backend URL must use HTTP or HTTPS.");
  }

  return url.toString();
}

function normalizeKeywords(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return { word: item, meaning: "" };
      if (!item || typeof item !== "object") return null;

      const word = item.word ?? item.text ?? item.term ?? item.english;
      const meaning = item.meaning ?? item.definition ?? item.korean ?? "";
      if (typeof word !== "string" || !word.trim()) return null;

      return {
        word: word.trim(),
        meaning: typeof meaning === "string" && meaning.trim() ? meaning.trim() : "뜻 정보 없음"
      };
    })
    .filter(Boolean);
}

async function lookupWords(payload) {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const backendUrl = normalizeBackendUrl(stored[STORAGE_KEY]);
  if (!backendUrl) return { keyWords: [], skipped: true };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: payload.text }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Backend request failed (${response.status}).`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The backend returned invalid JSON.");
    }

    return {
      keyWords: normalizeKeywords(data.keyWords ?? data.keywords ?? data.words),
      skipped: false
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The backend request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
