(() => {
  const REQUEST_TYPE = "NETFLIX_SUBTITLE_LEARNER_CAPTURE";
  const RESPONSE_TYPE = "NETFLIX_SUBTITLE_LEARNER_CAPTURE_RESULT";
  const SUBTITLE_SELECTORS = [
    '[data-uia="player-subtitle"]',
    ".player-timedtext-text-container",
    ".player-timedtext"
  ];
  const HANGUL_PATTERN = /[\u3131-\u318e\uac00-\ud7a3]/;
  let captureQueue = Promise.resolve();

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function readRenderedSubtitle() {
    for (const selector of SUBTITLE_SELECTORS) {
      const lines = [...document.querySelectorAll(selector)]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => normalizeText(element.innerText || element.textContent))
        .filter(Boolean);
      if (lines.length) return [...new Set(lines)].join(" ");
    }
    return "";
  }

  function getPlayer() {
    const videoPlayer = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    const sessionIds = videoPlayer?.getAllPlayerSessionIds?.() || [];
    for (const sessionId of [...sessionIds].reverse()) {
      const player = videoPlayer.getVideoPlayerBySessionId?.(sessionId);
      if (player?.getTimedTextTrackList && player?.setTimedTextTrack) return player;
    }
    return null;
  }

  function getTracks(player) {
    const value = player.getTimedTextTrackList();
    if (Array.isArray(value)) return value;
    if (value && typeof value[Symbol.iterator] === "function") return [...value];
    if (value && typeof value === "object") return Object.values(value).filter((track) => track && typeof track === "object");
    return [];
  }

  function trackDescription(track) {
    const keys = ["bcp47", "language", "languageCode", "languageDescription", "lang", "locale", "displayName", "name", "id", "trackId"];
    return keys
      .map((key) => track?.[key])
      .filter((value) => typeof value === "string" || typeof value === "number")
      .join(" ");
  }

  function findLanguageTrack(tracks, language) {
    const languagePattern = language === "ko"
      ? /(^|[^a-z])(ko|kor|ko-kr)([^a-z]|$)|korean|한국어/i
      : /(^|[^a-z])(en|eng|en-us|en-gb)([^a-z]|$)|english/i;
    return tracks.find((track) => languagePattern.test(trackDescription(track)));
  }

  function sameTrack(left, right) {
    if (left === right) return true;
    const leftId = left?.id ?? left?.trackId;
    const rightId = right?.id ?? right?.trackId;
    return leftId !== undefined && rightId !== undefined && leftId === rightId;
  }

  function textMatchesLanguage(text, language) {
    if (!text) return false;
    return language === "ko" ? HANGUL_PATTERN.test(text) : /[A-Za-z]/.test(text) && !HANGUL_PATTERN.test(text);
  }

  async function waitForSubtitle(language, previousText, allowCurrentText) {
    const deadline = Date.now() + 1_600;
    while (Date.now() < deadline) {
      if (!document.querySelector("video")?.paused) return null;
      const text = readRenderedSubtitle();
      if (textMatchesLanguage(text, language) && (allowCurrentText || text !== previousText)) return text;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return "";
  }

  async function selectAndRead(player, track, language, currentTrack) {
    const before = readRenderedSubtitle();
    const alreadySelected = sameTrack(track, currentTrack);
    if (!alreadySelected) await Promise.resolve(player.setTimedTextTrack(track));
    return waitForSubtitle(language, before, alreadySelected);
  }

  async function captureDualSubtitles() {
    const video = document.querySelector("video");
    if (!video?.paused) return { available: false, reason: "Playback is not paused." };

    const player = getPlayer();
    if (!player) return { available: false, reason: "Netflix timed-text API is not accessible." };

    let tracks;
    try {
      tracks = getTracks(player);
    } catch {
      return { available: false, reason: "Netflix timed-text tracks could not be read." };
    }
    const englishTrack = findLanguageTrack(tracks, "en");
    const koreanTrack = findLanguageTrack(tracks, "ko");
    if (!englishTrack || !koreanTrack) {
      return { available: false, reason: "English and Korean tracks are not both available." };
    }

    const originalTrack = player.getTimedTextTrack?.();
    let english = "";
    let korean = "";
    try {
      english = await selectAndRead(player, englishTrack, "en", originalTrack);
      if (video.paused) korean = await selectAndRead(player, koreanTrack, "ko", englishTrack);
    } catch {
      return { available: false, reason: "Netflix rejected timed-text track access." };
    } finally {
      try {
        if (!sameTrack(originalTrack, koreanTrack)) {
          await Promise.resolve(player.setTimedTextTrack(originalTrack));
        }
      } catch {
        // Netflix owns this private API; restoration can fail if the player is replaced mid-capture.
      }
    }

    const resumed = english === null || korean === null;
    return {
      available: Boolean(english && korean),
      english: english || "",
      korean: korean || "",
      reason: english && korean
        ? ""
        : resumed
          ? "Playback resumed before subtitle capture finished."
          : "The selected track did not expose a subtitle at this timestamp."
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE || typeof event.data.requestId !== "string") return;
    const { requestId } = event.data;
    captureQueue = captureQueue
      .catch(() => undefined)
      .then(captureDualSubtitles)
      .catch(() => ({ available: false, reason: "Netflix timed-text access failed." }))
      .then((result) => window.postMessage({ type: RESPONSE_TYPE, requestId, result }, "*"));
  });
})();
