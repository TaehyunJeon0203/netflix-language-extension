export interface Translator {
  translate(text: string): Promise<string>;
}

interface DeepLResponse {
  translations?: Array<{ text?: unknown }>;
}

export class DeepLError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "DeepLError";
  }
}

export function createDeepLTranslator(options: {
  apiKey: string;
  apiUrl: string;
  timeoutMs: number;
}): Translator {
  return {
    async translate(text: string): Promise<string> {
      let response: Response;
      try {
        response = await fetch(options.apiUrl, {
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${options.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: [text],
            source_lang: "EN",
            target_lang: "KO"
          }),
          signal: AbortSignal.timeout(options.timeoutMs)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        throw new DeepLError(`DeepL request failed: ${message}`);
      }

      if (!response.ok) {
        throw new DeepLError("DeepL returned an error", response.status);
      }

      let payload: DeepLResponse;
      try {
        payload = (await response.json()) as DeepLResponse;
      } catch {
        throw new DeepLError("DeepL returned invalid JSON");
      }

      const translation = payload.translations?.[0]?.text;
      if (typeof translation !== "string") {
        throw new DeepLError("DeepL response did not contain a translation");
      }
      return translation;
    }
  };
}
