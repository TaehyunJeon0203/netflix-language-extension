# Netflix Language Extension Server

Small TypeScript/Node service that adds definitions from the free [Dictionary API](https://dictionaryapi.dev/) to English subtitle words. Translation is intentionally not part of this service.

## Setup

Requires Node.js 20 or later.

```bash
cp .env.example .env
npm install
npm run dev
```

No API key is required. The default server port is `3000`.

## API

### `POST /api/analyze`

Request (JSON, maximum 5,000 characters):

```json
{ "text": "Hello world" }
```

Response:

```json
{
  "words": [
      { "text": "Hello", "normalized": "hello", "count": 1, "definition": "used as a greeting" },
      { "text": "world", "normalized": "world", "count": 1, "definition": "the earth and all its countries" }
  ]
}
```

`words` contains up to five unique words from the subtitle, in first-seen order, with definitions from the free Dictionary API when available. Dictionary failures are non-fatal and leave the affected word without a definition.

The service uses an in-memory bounded TTL cache and per-IP rate limiting. Cache and limits reset when the process restarts. Configure allowed origins with comma-separated `CORS_ORIGINS`; when unset, all origins are accepted. Do not expose this service publicly with unrestricted CORS unless that is intentional.

## Checks and production

```bash
npm test
npm run typecheck
npm run build
npm start
```

Errors use `{ "error": { "code": "...", "message": "..." } }`. The service has no translation credentials or paid API dependency.
