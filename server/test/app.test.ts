import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { DeepLError, type Translator } from "../src/deepl.js";

const config: AppConfig = {
  deeplApiKey: "test-key",
  deeplApiUrl: "https://example.test/translate",
  port: 3000,
  corsOrigins: null,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1_000,
  cacheTtlMs: 60_000,
  cacheMaxEntries: 10,
  deeplTimeoutMs: 1_000
};

describe("POST /api/analyze", () => {
  it("returns translation and deterministic word metadata", async () => {
    const translator: Translator = { translate: vi.fn().mockResolvedValue("안녕 세상") };
    const response = await request(createApp(config, translator))
      .post("/api/analyze")
      .send({ text: "Hello, hello world's!" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      translation: "안녕 세상",
      words: [
        { text: "Hello", normalized: "hello", count: 2 },
        { text: "world's", normalized: "world's", count: 1 }
      ]
    });
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: 123 }])(
    "rejects invalid input %#",
    async (body) => {
      const translator: Translator = { translate: vi.fn() };
      const response = await request(createApp(config, translator))
        .post("/api/analyze")
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_TEXT");
      expect(translator.translate).not.toHaveBeenCalled();
    }
  );

  it("caches successful responses by exact input", async () => {
    const translate = vi.fn().mockResolvedValue("캐시됨");
    const app = createApp(config, { translate });

    await request(app).post("/api/analyze").send({ text: "Cached" }).expect(200);
    await request(app).post("/api/analyze").send({ text: "Cached" }).expect(200);

    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("maps upstream failures without leaking details", async () => {
    const translator: Translator = {
      translate: vi.fn().mockRejectedValue(new DeepLError("secret upstream detail", 403))
    };
    const response = await request(createApp(config, translator))
      .post("/api/analyze")
      .send({ text: "Hello" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "TRANSLATION_FAILED",
        message: "Translation service is unavailable"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("rejects oversized JSON bodies with a client error", async () => {
    const translator: Translator = { translate: vi.fn() };
    const response = await request(createApp(config, translator))
      .post("/api/analyze")
      .send({ text: "x".repeat(17_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("BODY_TOO_LARGE");
    expect(translator.translate).not.toHaveBeenCalled();
  });

  it("rate limits API requests", async () => {
    const limitedConfig = { ...config, rateLimitMax: 1 };
    const translator: Translator = { translate: vi.fn().mockResolvedValue("안녕") };
    const app = createApp(limitedConfig, translator);

    await request(app).post("/api/analyze").send({ text: "First" }).expect(200);
    const response = await request(app)
      .post("/api/analyze")
      .send({ text: "Second" });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
