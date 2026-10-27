import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepLTranslator, DeepLError } from "../src/deepl.js";

afterEach(() => vi.unstubAllGlobals());

describe("DeepL translator", () => {
  it("sends an authenticated EN to KO request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ translations: [{ text: "안녕하세요" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const translator = createDeepLTranslator({
      apiKey: "key",
      apiUrl: "https://example.test/v2/translate",
      timeoutMs: 1_000
    });

    await expect(translator.translate("Hello")).resolves.toBe("안녕하세요");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v2/translate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "DeepL-Auth-Key key" }),
        body: JSON.stringify({ text: ["Hello"], source_lang: "EN", target_lang: "KO" })
      })
    );
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const translator = createDeepLTranslator({
      apiKey: "key",
      apiUrl: "https://example.test",
      timeoutMs: 1_000
    });

    await expect(translator.translate("Hello")).rejects.toBeInstanceOf(DeepLError);
  });
});
