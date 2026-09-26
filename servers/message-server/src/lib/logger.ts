import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { serviceName: process.env.SERVICE_NAME ?? "message-server" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "authorization", "cookie", "password", "token", "ciphertext", "privateKey", "secret"],
    censor: "[REDACTED]",
  },
});
