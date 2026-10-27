import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { DictionaryLookup } from "../src/dictionary.js";

const config: AppConfig = {
  port: 3000,
  corsOrigins: null,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 1_000,
  cacheTtlMs: 60_000,
  cacheMaxEntries: 10
};

describe("POST /api/analyze", () => {
  it("returns deterministic word metadata without a translation service", async () => {
    const response = await request(createApp(config))
      .post("/api/analyze")
      .send({ text: "Hello, hello world's!" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      words: [
        { text: "Hello", normalized: "hello", count: 2 },
        { text: "world's", normalized: "world's", count: 1 }
      ]
    });
  });

  it("adds dictionary definitions to the response word shape", async () => {
    const dictionary: DictionaryLookup = vi.fn(async (word) =>
      word === "hello" ? { definition: "a greeting", partOfSpeech: "interjection" } : null
    );
    const response = await request(
      createApp(config, dictionary)
    )
      .post("/api/analyze")
      .send({ text: "Hello world" });

    expect(response.body.words).toEqual([
      {
        text: "Hello",
        normalized: "hello",
        count: 1,
        definition: "a greeting",
        partOfSpeech: "interjection"
      },
      { text: "world", normalized: "world", count: 1 }
    ]);
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: 123 }])(
    "rejects invalid input %#",
    async (body) => {
      const dictionary: DictionaryLookup = vi.fn();
      const response = await request(createApp(config, dictionary))
        .post("/api/analyze")
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_TEXT");
      expect(dictionary).not.toHaveBeenCalled();
    }
  );

  it("caches successful responses by exact input", async () => {
    const dictionary: DictionaryLookup = vi.fn().mockResolvedValue(null);
    const app = createApp(config, dictionary);

    await request(app).post("/api/analyze").send({ text: "Cached" }).expect(200);
    await request(app).post("/api/analyze").send({ text: "Cached" }).expect(200);

    expect(dictionary).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized JSON bodies with a client error", async () => {
    const dictionary: DictionaryLookup = vi.fn();
    const response = await request(createApp(config, dictionary))
      .post("/api/analyze")
      .send({ text: "x".repeat(17_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("BODY_TOO_LARGE");
    expect(dictionary).not.toHaveBeenCalled();
  });

  it("rate limits API requests", async () => {
    const limitedConfig = { ...config, rateLimitMax: 1 };
    const app = createApp(limitedConfig);

    await request(app).post("/api/analyze").send({ text: "First" }).expect(200);
    const response = await request(app)
      .post("/api/analyze")
      .send({ text: "Second" });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
