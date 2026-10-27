# Netflix Language Extension Server

Small TypeScript/Node proxy that keeps the DeepL key server-side and translates English text to Korean.

## Setup

Requires Node.js 20 or later.

```bash
cp .env.example .env
npm install
npm run dev
```

Set `DEEPL_API_KEY` in `.env`. DeepL Free accounts use the default `api-free.deepl.com`; set `DEEPL_API_URL=https://api.deepl.com/v2/translate` for DeepL Pro.

## API

### `POST /api/analyze`

Request (JSON, maximum 5,000 characters):

```json
{ "text": "Hello world" }
```

Response:

```json
{
  "translation": "안녕하세요, 세계",
  "words": [
      { "text": "Hello", "normalized": "hello", "count": 1, "definition": "used as a greeting" },
      { "text": "world", "normalized": "world", "count": 1, "definition": "the earth and all its countries" }
  ]
}
```

`words` contains up to five unique words from the subtitle, in first-seen order, with definitions from the free Dictionary API when available. Dictionary failures do not fail the translation request.

The service uses an in-memory bounded TTL cache and per-IP rate limiting. Cache and limits reset when the process restarts. Configure allowed origins with comma-separated `CORS_ORIGINS`; when unset, all origins are accepted. Do not expose this service publicly with unrestricted CORS unless that is intentional.

## Checks and production

```bash
npm test
npm run typecheck
npm run build
npm start
```

Errors use `{ "error": { "code": "...", "message": "..." } }`. DeepL details and credentials are never returned to clients.
