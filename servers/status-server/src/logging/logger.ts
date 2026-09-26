import pino, { type Logger } from "pino";

import type { StatusServerConfig } from "../config.js";

export function createLogger(config: StatusServerConfig): Logger {
  return pino({ level: config.LOG_LEVEL, base: { service: config.SERVICE_NAME, version: config.SERVICE_VERSION } });
}
