import pino, { type Logger } from "pino";

import { env } from "../config/env.js";

export { type Logger };
export const logger = pino({
  name: env.SERVICE_NAME,
  level: env.LOG_LEVEL,
  base: { service: env.SERVICE_NAME, version: env.SERVICE_VERSION },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "authorization", "cookie", "password", "pushToken", "token", "ciphertext", "secret", "EXPO_ACCESS_TOKEN"],
    censor: "[REDACTED]",
  },
});

export function requestLogger(requestId: string, correlationId: string): Logger {
  return logger.child({ requestId, correlationId });
}
