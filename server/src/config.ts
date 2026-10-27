export interface AppConfig {
  deeplApiKey: string;
  deeplApiUrl: string;
  port: number;
  corsOrigins: string[] | null;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  deeplTimeoutMs: number;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const deeplApiKey = process.env.DEEPL_API_KEY?.trim();
  if (!deeplApiKey) throw new Error("DEEPL_API_KEY is required");

  const origins = process.env.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    deeplApiKey,
    deeplApiUrl:
      process.env.DEEPL_API_URL?.trim() ||
      "https://api-free.deepl.com/v2/translate",
    port: positiveInteger("PORT", 3000),
    corsOrigins: origins?.length ? origins : null,
    rateLimitWindowMs: positiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: positiveInteger("RATE_LIMIT_MAX", 60),
    cacheTtlMs: positiveInteger("CACHE_TTL_MS", 300_000),
    cacheMaxEntries: positiveInteger("CACHE_MAX_ENTRIES", 500),
    deeplTimeoutMs: positiveInteger("DEEPL_TIMEOUT_MS", 10_000)
  };
}
