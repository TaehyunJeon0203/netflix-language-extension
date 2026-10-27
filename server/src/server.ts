import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDeepLTranslator } from "./deepl.js";
import { createDictionaryLookup } from "./dictionary.js";

const config = loadConfig();
const translator = createDeepLTranslator({
  apiKey: config.deeplApiKey,
  apiUrl: config.deeplApiUrl,
  timeoutMs: config.deeplTimeoutMs
});

createApp(config, translator, createDictionaryLookup()).listen(config.port, () => {
  console.log(`DeepL proxy listening on port ${config.port}`);
});
