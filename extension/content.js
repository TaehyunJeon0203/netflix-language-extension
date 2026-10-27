(() => {
  const SUBTITLE_SELECTORS = [
    '[data-uia="player-subtitle"]',
    ".player-timedtext-text-container",
    ".player-timedtext"
  ];
  const BRIDGE_REQUEST = "NETFLIX_SUBTITLE_LEARNER_CAPTURE";
  const BRIDGE_RESPONSE = "NETFLIX_SUBTITLE_LEARNER_CAPTURE_RESULT";
  const POLL_INTERVAL_MS = 600;
  const OVERLAY_HOST_ID = "netflix-subtitle-learner-root";
  const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/;

  let currentRenderedText = "";
  let lastRequestedText = "";
  let observedVideo = null;
  let requestSequence = 0;
  let scanQueued = false;
  let captureInProgress = false;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function readRenderedLines() {
    for (const selector of SUBTITLE_SELECTORS) {
      const lines = [...document.querySelectorAll(selector)]
        .filter(isVisible)
        .map((element) => normalizeText(element.innerText || element.textContent))
        .filter(Boolean);
      if (lines.length) return [...new Set(lines)];
    }
    return [];
  }

  function classifyLines(lines) {
    const korean = lines.filter((line) => HANGUL_PATTERN.test(line));
    const english = lines.filter((line) => /[A-Za-z]/.test(line) && !HANGUL_PATTERN.test(line));
    return {
      english: [...new Set(english)].join(" "),
      korean: [...new Set(korean)].join(" "),
      rendered: [...new Set(lines)].join(" ")
    };
  }

  function readNativeCues(video) {
    const result = { english: "", korean: "" };
    if (!video?.textTracks) return result;

    for (const track of video.textTracks) {
      const language = normalizeText(`${track.language || ""} ${track.label || ""}`).toLowerCase();
      const key = /(^|\s)(ko|kor|ko-kr)(\s|$)|korean|한국어/.test(language)
        ? "korean"
        : /(^|\s)(en|eng|en-us|en-gb)(\s|$)|english/.test(language)
          ? "english"
          : null;
      if (!key) continue;
      try {
        const text = [...(track.activeCues || [])]
          .map((cue) => normalizeText(cue.text))
          .filter(Boolean)
          .join(" ");
        if (text) result[key] = text;
      } catch {
        // Some protected media tracks expose metadata but not cue data.
      }
    }
    return result;
  }

  function readAccessibleSubtitles() {
    const rendered = classifyLines(readRenderedLines());
    const native = readNativeCues(observedVideo);
    return {
      english: native.english || rendered.english,
      korean: native.korean || rendered.korean,
      rendered: rendered.rendered
    };
  }

  function requestBridgeCapture() {
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        resolve({ available: false, reason: "Netflix timed-text access timed out." });
      }, 4_500);

      function handleMessage(event) {
        if (event.source !== window || event.data?.type !== BRIDGE_RESPONSE || event.data.requestId !== requestId) return;
        window.clearTimeout(timeoutId);
        window.removeEventListener("message", handleMessage);
        resolve(event.data.result || { available: false });
      }

      window.addEventListener("message", handleMessage);
      window.postMessage({ type: BRIDGE_REQUEST, requestId }, "*");
    });
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
        .card { box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 110px)); overflow: auto; border: 1px solid rgba(255,255,255,.15); border-radius: 14px; background: rgba(18,18,18,.96); box-shadow: 0 18px 48px rgba(0,0,0,.5); color: #f5f5f5; font: 14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding: 18px; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .title { margin: 0; color: #e50914; font-size: 13px; font-weight: 750; letter-spacing: .05em; text-transform: uppercase; }
        .close { border: 0; background: transparent; color: #aaa; cursor: pointer; font-size: 22px; line-height: 1; padding: 0 2px; }
        .close:hover, .close:focus-visible { color: #fff; outline: none; }
        .label { margin: 14px 0 3px; color: #999; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .subtitle { margin: 0; font-size: 17px; line-height: 1.5; }
        .korean { font-size: 19px; font-weight: 650; }
        .fallback, .lookup-error { margin: 8px 0 0; color: #aaa; font-size: 13px; }
        .status { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #ccc; }
        .spinner { width: 16px; height: 16px; border: 2px solid #555; border-top-color: #e50914; border-radius: 50%; animation: spin .8s linear infinite; }
        .words { display: grid; gap: 8px; margin: 16px 0 0; padding: 14px 0 0; border-top: 1px solid #333; }
        .word { display: grid; grid-template-columns: minmax(80px,auto) 1fr; gap: 10px; }
        .term { color: #fff; font-weight: 700; }
        .meaning { color: #bbb; }
        [hidden] { display: none !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
      <section class="card" role="dialog" aria-label="English and Korean Netflix subtitles">
        <div class="header"><h2 class="title">Subtitle Learner</h2><button class="close" type="button" aria-label="Close">×</button></div>
        <div class="status" role="status"><span class="spinner" aria-hidden="true"></span><span>Reading Netflix subtitle tracks…</span></div>
        <div class="result" hidden>
          <p class="label english-label">English</p><p class="subtitle english" lang="en"></p>
          <p class="label korean-label">한국어</p><p class="subtitle korean" lang="ko"></p>
          <p class="fallback" role="status" hidden></p>
        </div>
        <div class="words" hidden></div>
        <p class="lookup-error" role="status" hidden></p>
      </section>`;
    root.querySelector(".close").addEventListener("click", () => {
      requestSequence += 1;
      captureInProgress = false;
      host.remove();
    });
    document.documentElement.appendChild(host);
    return root;
  }

  function getOverlayRoot() {
    return document.getElementById(OVERLAY_HOST_ID)?.shadowRoot || createOverlay();
  }

  function showLoading() {
    const root = createOverlay();
    root.querySelector(".status").hidden = false;
    root.querySelector(".result").hidden = true;
    root.querySelector(".words").hidden = true;
    root.querySelector(".lookup-error").hidden = true;
  }

  function showSubtitles(english, korean, reason) {
    const root = createOverlay();
    root.querySelector(".status").hidden = true;
    root.querySelector(".result").hidden = false;
    root.querySelector(".english").textContent = english || "English subtitle unavailable at this timestamp.";
    root.querySelector(".korean-label").hidden = !korean;
    root.querySelector(".korean").hidden = !korean;
    root.querySelector(".korean").textContent = korean;
    const fallback = root.querySelector(".fallback");
    fallback.textContent = korean ? "" : (reason || "Korean subtitle unavailable at this timestamp.");
    fallback.hidden = Boolean(korean);
  }

  function showWords(keyWords) {
    const root = getOverlayRoot();
    const words = root.querySelector(".words");
    words.replaceChildren();
    for (const keyword of keyWords) {
      const row = document.createElement("div");
      row.className = "word";
      const term = document.createElement("span");
      term.className = "term";
      term.textContent = keyword.word;
      const meaning = document.createElement("span");
      meaning.className = "meaning";
      meaning.textContent = keyword.meaning || keyword.definition || "Definition unavailable.";
      row.append(term, meaning);
      words.appendChild(row);
    }
    words.hidden = keyWords.length === 0;
  }

  function showLookupError(message) {
    const error = getOverlayRoot().querySelector(".lookup-error");
    error.textContent = message;
    error.hidden = false;
  }

  async function lookupWords(english, sequence) {
    if (!english) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: "LOOKUP_WORDS", payload: { text: english } });
      if (sequence !== requestSequence || !response?.ok) {
        if (sequence === requestSequence && response?.error) showLookupError(response.error);
        return;
      }
      showWords(response.result?.keyWords || []);
    } catch (error) {
      if (sequence === requestSequence) showLookupError(error instanceof Error ? error.message : "Word lookup failed.");
    }
  }

  async function presentSubtitles(force = false) {
    const initial = readAccessibleSubtitles();
    if (!initial.rendered && !initial.english && !initial.korean) return;
    if (!force && initial.rendered === lastRequestedText) return;

    lastRequestedText = initial.rendered;
    const sequence = ++requestSequence;
    captureInProgress = true;
    showLoading();

    let bridgeResult = null;
    if (!initial.english || !initial.korean) bridgeResult = await requestBridgeCapture();
    if (sequence !== requestSequence) return;

    const english = initial.english || normalizeText(bridgeResult?.english);
    const korean = initial.korean || normalizeText(bridgeResult?.korean);
    const reason = bridgeResult?.reason || "Korean subtitle unavailable at this timestamp.";
    showSubtitles(english, korean, reason);
    captureInProgress = false;
    currentRenderedText = classifyLines(readRenderedLines()).rendered;
    void lookupWords(english, sequence);
  }

  function scanSubtitle() {
    scanQueued = false;
    const nextText = classifyLines(readRenderedLines()).rendered;
    if (nextText === currentRenderedText) return;
    currentRenderedText = nextText;
    if (nextText && observedVideo?.paused && !captureInProgress) void presentSubtitles();
  }

  function queueSubtitleScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scanSubtitle);
  }

  function handlePause() {
    currentRenderedText = classifyLines(readRenderedLines()).rendered || currentRenderedText;
    void presentSubtitles(true);
  }

  function bindVideo() {
    const nextVideo = document.querySelector("video");
    if (!nextVideo || nextVideo === observedVideo) return;
    observedVideo?.removeEventListener("pause", handlePause);
    observedVideo = nextVideo;
    observedVideo.addEventListener("pause", handlePause);
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
