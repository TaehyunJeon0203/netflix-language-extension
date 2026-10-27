import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDictionaryLookup } from "./dictionary.js";

const config = loadConfig();

createApp(config, createDictionaryLookup()).listen(config.port, () => {
  console.log(`Dictionary lookup server listening on port ${config.port}`);
});
