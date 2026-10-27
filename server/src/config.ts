export interface AppConfig {
  port: number;
  corsOrigins: string[] | null;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
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
  const origins = process.env.CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: positiveInteger("PORT", 3000),
    corsOrigins: origins?.length ? origins : null,
    rateLimitWindowMs: positiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: positiveInteger("RATE_LIMIT_MAX", 60),
    cacheTtlMs: positiveInteger("CACHE_TTL_MS", 300_000),
    cacheMaxEntries: positiveInteger("CACHE_MAX_ENTRIES", 500)
  };
}
