import pino, { type Logger } from "pino";

import type { AdminServerConfig } from "../config/env.js";

export type { Logger };

export function createServiceLogger(config: Pick<AdminServerConfig, "SERVICE_NAME" | "LOG_LEVEL">): Logger {
  return pino({ level: config.LOG_LEVEL, base: { service: config.SERVICE_NAME } });
}

export const logger = createServiceLogger(envForLogger());

function envForLogger(): Pick<AdminServerConfig, "SERVICE_NAME" | "LOG_LEVEL"> {
  return {
    SERVICE_NAME: process.env.SERVICE_NAME?.trim() || "admin-server",
    LOG_LEVEL: (process.env.LOG_LEVEL as AdminServerConfig["LOG_LEVEL"] | undefined) ?? "info",
  };
}

export function childLogger(base: Logger, values: { requestId: string; correlationId: string }): Logger {
  return base.child(values);
}
