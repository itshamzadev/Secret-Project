import pino, { type Logger } from "pino";

import { env } from "../config/env.js";

export { type Logger };

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME, version: env.SERVICE_VERSION },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "authorization", "cookie", "body", "file", "ciphertext"],
    censor: "[REDACTED]",
  },
});
