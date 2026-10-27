(() => {
  const SUBTITLE_SELECTORS = [
    '[data-uia="player-subtitle"]',
    ".player-timedtext-text-container",
    ".player-timedtext"
  ];
  const POLL_INTERVAL_MS = 600;
  const OVERLAY_HOST_ID = "netflix-subtitle-learner-root";

  let currentSubtitle = "";
  let lastRequestedSubtitle = "";
  let observedVideo = null;
  let requestSequence = 0;
  let scanQueued = false;

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function readSubtitle() {
    for (const selector of SUBTITLE_SELECTORS) {
      const candidates = [...document.querySelectorAll(selector)].filter(isVisible);
      if (!candidates.length) continue;

      const lines = candidates
        .map((element) => normalizeText(element.innerText || element.textContent || ""))
        .filter(Boolean);
      const uniqueLines = [...new Set(lines)];
      if (uniqueLines.length) return uniqueLines.join(" ");
    }
    return "";
  }

  function scanSubtitle() {
    scanQueued = false;
    const nextSubtitle = readSubtitle();
    if (nextSubtitle === currentSubtitle) return;

    currentSubtitle = nextSubtitle;
    if (nextSubtitle !== lastRequestedSubtitle && observedVideo?.paused) {
      requestTranslation(nextSubtitle);
    }
  }

  function queueSubtitleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scanSubtitle);
  }

  function bindVideo() {
    const nextVideo = document.querySelector("video");
    if (!nextVideo || nextVideo === observedVideo) return;

    observedVideo?.removeEventListener("pause", handlePause);
    observedVideo = nextVideo;
    observedVideo.addEventListener("pause", handlePause);
  }

  function handlePause() {
    const subtitle = readSubtitle() || currentSubtitle;
    if (subtitle) {
      currentSubtitle = subtitle;
      requestTranslation(subtitle);
    }
  }

  function createOverlay() {
    const existing = document.getElementById(OVERLAY_HOST_ID);
    if (existing) return existing.shadowRoot;

    const host = document.createElement("div");
    host.id = OVERLAY_HOST_ID;
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("right", "24px", "important");
    host.style.setProperty("bottom", "72px", "important");
    host.style.setProperty("z-index", "2147483647", "important");

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        .card {
          box-sizing: border-box;
          width: min(380px, calc(100vw - 32px));
          max-height: min(520px, calc(100vh - 110px));
          overflow: auto;
          border: 1px solid rgba(255, 255, 255, .15);
          border-radius: 14px;
          background: rgba(18, 18, 18, .96);
          box-shadow: 0 18px 48px rgba(0, 0, 0, .5);
          color: #f5f5f5;
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 18px;
        }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .title { margin: 0; color: #e50914; font-size: 13px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
        .close { border: 0; background: transparent; color: #aaa; cursor: pointer; font-size: 22px; line-height: 1; padding: 0 2px; }
        .close:hover, .close:focus-visible { color: #fff; outline: none; }
        .source { margin: 12px 0 0; color: #aaa; font-size: 13px; }
        .translation { margin: 10px 0 0; font-size: 19px; font-weight: 650; line-height: 1.45; }
        .status { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #ccc; }
        .spinner { width: 16px; height: 16px; border: 2px solid #555; border-top-color: #e50914; border-radius: 50%; animation: spin .8s linear infinite; }
        .error { margin-top: 12px; color: #ff9b9f; }
        .words { display: grid; gap: 8px; margin: 16px 0 0; padding: 14px 0 0; border-top: 1px solid #333; }
        .word { display: grid; grid-template-columns: minmax(80px, auto) 1fr; gap: 10px; }
        .term { color: #fff; font-weight: 700; }
        .meaning { color: #bbb; }
        [hidden] { display: none !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
      <section class="card" role="dialog" aria-label="Korean subtitle translation">
        <div class="header"><h2 class="title">Subtitle Learner</h2><button class="close" type="button" aria-label="Close">×</button></div>
        <p class="source"></p>
        <div class="status" role="status"><span class="spinner" aria-hidden="true"></span><span>Translating…</span></div>
        <p class="translation" lang="ko" hidden></p>
        <p class="error" role="alert" hidden></p>
        <div class="words" hidden></div>
      </section>`;
    root.querySelector(".close").addEventListener("click", () => host.remove());
    document.documentElement.appendChild(host);
    return root;
  }

  function showLoading(subtitle) {
    const root = createOverlay();
    root.querySelector(".source").textContent = subtitle;
    root.querySelector(".status").hidden = false;
    root.querySelector(".translation").hidden = true;
    root.querySelector(".error").hidden = true;
    root.querySelector(".words").hidden = true;
  }

  function showResult(result) {
    const root = createOverlay();
    const translation = root.querySelector(".translation");
    const words = root.querySelector(".words");
    translation.textContent = result.translation;
    translation.hidden = false;
    root.querySelector(".status").hidden = true;

    words.replaceChildren();
    for (const keyword of result.keyWords) {
      const row = document.createElement("div");
      row.className = "word";
      const term = document.createElement("span");
      term.className = "term";
      term.textContent = keyword.word;
      const meaning = document.createElement("span");
      meaning.className = "meaning";
      meaning.textContent = keyword.meaning || keyword.definition || "뜻을 찾지 못했습니다.";
      row.append(term, meaning);
      words.appendChild(row);
    }
    words.hidden = result.keyWords.length === 0;
  }

  function showError(message) {
    const root = createOverlay();
    root.querySelector(".status").hidden = true;
    const error = root.querySelector(".error");
    error.textContent = message;
    error.hidden = false;
  }

  async function requestTranslation(subtitle) {
    const normalized = normalizeText(subtitle);
    if (!normalized || normalized === lastRequestedSubtitle) return;

    lastRequestedSubtitle = normalized;
    const sequence = ++requestSequence;
    showLoading(normalized);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_SUBTITLE",
        payload: { text: normalized, url: window.location.href }
      });
      if (sequence !== requestSequence) return;
      if (!response?.ok) throw new Error(response?.error || "Translation failed.");
      showResult(response.result);
    } catch (error) {
      if (sequence !== requestSequence) return;
      lastRequestedSubtitle = "";
      showError(error instanceof Error ? error.message : "Translation failed.");
    }
  }

  const observer = new MutationObserver(() => {
    bindVideo();
    queueSubtitleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  bindVideo();
  scanSubtitle();
  window.setInterval(() => {
    bindVideo();
    scanSubtitle();
  }, POLL_INTERVAL_MS);
})();
