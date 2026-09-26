import pino, { type Logger } from "pino";

import { env } from "../config/env.js";

export type { Logger };

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { serviceName: env.SERVICE_NAME },
  redact: {
    paths: ["req.headers.authorization", "authorization", "cookie", "token", "accessToken", "refreshToken", "ciphertext", "sdp", "candidate", "secret"],
    censor: "[REDACTED]"
  }
});
