# Netflix Subtitle Learner (Chrome MV3)

A minimal Chrome extension that shows Netflix-provided English and Korean subtitles together when playback is paused. It does not translate subtitle text and requires no local server or API key. English word definitions come directly from the free Dictionary API.

## Load locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension` directory.
5. Open a Netflix title that offers both English and Korean subtitles, enable subtitles, then pause while a subtitle is visible.

After changing extension files, click **Reload** on the extension card and refresh the Netflix tab.

## Dictionary lookup

The background service worker filters common function words, keeps useful nouns/verbs/adjectives/adverbs,
and calls Dictionary API plus MyMemory's free translation endpoint directly for up to five words per pause.
No server, API key, or configuration is required. If either service is unavailable, subtitles remain visible
and only word definitions are omitted.

## How detection works

- Rendered subtitle DOM and standard HTML media `textTracks` are checked first.
- If one language is missing, a main-world bridge checks Netflix's private player API for both tracks. While paused, it briefly selects English and Korean in turn, reads the rendered cue, and restores the original track.
- A `MutationObserver` plus a 600 ms polling fallback handles Netflix's dynamically replaced player and subtitle DOM.
- Only the English text is sent to Dictionary API.

## Limitations

- Netflix normally renders only the selected subtitle track. Dual capture therefore depends on an undocumented Netflix player API and current subtitle DOM; Netflix can change or block either at any time.
- Both English and Korean tracks must be offered for that title and a cue must exist at the paused timestamp. Otherwise the overlay keeps the available English subtitle and reports that Korean is unavailable.
- Track switching can cause a brief subtitle flicker while paused. The extension restores the original track, but restoration can fail if Netflix replaces the player during capture.
- Subtitle text is read from cues already made available by Netflix. The extension does not download, decrypt, or bypass access controls for unavailable tracks.
