import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import type { AppConfig } from "./config.js";
import { TtlCache } from "./cache.js";
import { DeepLError, type Translator } from "./deepl.js";
import { extractWords, type WordMetadata } from "./words.js";
import type { DictionaryLookup } from "./dictionary.js";

interface AnalyzeResponse {
  translation: string;
  words: WordMetadata[];
}

const MAX_TEXT_LENGTH = 5_000;

export function createApp(config: AppConfig, translator: Translator, dictionary?: DictionaryLookup) {
  const app = express();
  const cache = new TtlCache<AnalyzeResponse>(
    config.cacheTtlMs,
    config.cacheMaxEntries
  );

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: config.corsOrigins ?? true
    })
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Too many requests" }
      }
    })
  );

  app.post("/api/analyze", async (req, res, next) => {
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({
        error: { code: "INVALID_TEXT", message: "text must be a non-empty string" }
      });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({
        error: {
          code: "TEXT_TOO_LONG",
          message: `text must be at most ${MAX_TEXT_LENGTH} characters`
        }
      });
    }

    const cached = cache.get(text);
    if (cached) return res.json(cached);

    try {
      const words = extractWords(text).slice(0, 5);
      const dictionaryResults = dictionary
        ? await Promise.all(words.map((word) => dictionary(word.normalized)))
        : [];
      const result: AnalyzeResponse = {
        translation: await translator.translate(text),
        words: words.map((word, index) => ({ ...word, ...(dictionaryResults[index] ?? {}) }))
      };
      cache.set(text, result);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({
        error: { code: "BODY_TOO_LARGE", message: "Request body is too large" }
      });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body must be valid JSON" }
      });
      return;
    }
    if (error instanceof DeepLError) {
      res.status(502).json({
        error: {
          code: "TRANSLATION_FAILED",
          message: "Translation service is unavailable"
        }
      });
      return;
    }

    console.error(error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" }
    });
  };
  app.use(errorHandler);

  return app;
}
