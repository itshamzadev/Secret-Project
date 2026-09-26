import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: ["authorization", "cookie", "token", "password", "prompt", "query", "apiKey", "ciphertext", "*.query"], censor: "[REDACTED]" },
});
