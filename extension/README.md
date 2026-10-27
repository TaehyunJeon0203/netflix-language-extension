# Netflix Subtitle Learner (Chrome MV3)

A minimal Chrome extension that watches rendered Netflix subtitles. When playback is paused, it sends the current subtitle to a configured backend and shows the Korean translation and key words in an on-page overlay.

## Load locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension` directory.
5. Click the extension toolbar icon and save your backend URL.
6. Open a Netflix title with subtitles enabled, then pause while a subtitle is visible.

After changing extension files, click **Reload** on the extension card and refresh the Netflix tab.

## Backend configuration and contract

The toolbar popup (also available under the extension's **Options**) stores the endpoint in Chrome sync storage. Both `http://` and `https://` URLs are accepted. With the included server, use `http://localhost:8787/api/analyze` during development.

The extension sends a JSON `POST` request:

```json
{
  "text": "The rendered subtitle text",
  "sourceLanguage": "auto",
  "targetLanguage": "ko",
  "url": "https://www.netflix.com/watch/..."
}
```

Expected response:

```json
{
  "translation": "한국어 번역",
  "keyWords": [
    { "word": "rendered", "meaning": "표시된" },
    { "word": "subtitle", "meaning": "자막" }
  ]
}
```

For convenience, `korean`, `translatedText`, `keywords`, and string-only keyword arrays are also accepted. Requests time out after 15 seconds. The extension requests broad host access because the backend URL is user-configurable; only the saved endpoint receives subtitle data.

## How detection works

- A `MutationObserver` reacts to Netflix's dynamically rendered player DOM.
- A 600 ms polling fallback handles player replacements or DOM changes that do not produce a useful observer event.
- The current `<video>` element is rebound when Netflix replaces it.
- Consecutive duplicate subtitle text is sent only once. A changed subtitle can be sent while already paused.

Netflix can change its private player markup at any time. Update `SUBTITLE_SELECTORS` in `content.js` if subtitle detection stops working.
