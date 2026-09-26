import { randomUUID } from "node:crypto";

import pino, {
  type Logger,
  type LoggerOptions,
  type LevelWithSilent,
} from "pino";

export const requestIdHeader = "X-Request-ID";
export const correlationIdHeader = "X-Correlation-ID";

const validIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface RequestContextInput {
  requestId?: string | string[];
  correlationId?: string | string[];
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized === "" ? undefined : normalized;
}

function validIncomingId(value: string | undefined): string | undefined {
  return value !== undefined && validIdPattern.test(value) ? value : undefined;
}

export function createRequestContext(
  input: RequestContextInput = {},
): RequestContext {
  const generatedRequestId = randomUUID();
  const requestId =
    validIncomingId(firstHeaderValue(input.requestId)) ?? generatedRequestId;
  const correlationId =
    validIncomingId(firstHeaderValue(input.correlationId)) ?? requestId;

  return { requestId, correlationId };
}

export interface ServiceLoggerOptions {
  serviceName: string;
  level?: LevelWithSilent;
  redact?: LoggerOptions["redact"];
}

export const defaultRedactionPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.raw.headers["authorization"]',
  'req.raw.headers["cookie"]',
  'res.headers["set-cookie"]',
  "authorization",
  "cookie",
  '"set-cookie"',
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "secret",
  "privateKey",
  "private_key",
  "ciphertext",
];

export function createServiceLogger(options: ServiceLoggerOptions): Logger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? "info",
    base: { serviceName: options.serviceName },
    redact: options.redact ?? {
      paths: defaultRedactionPaths,
      censor: "[REDACTED]",
    },
  };

  return pino(loggerOptions);
}

export function childLogger(
  logger: Logger,
  fields: Record<string, unknown>,
): Logger {
  return logger.child(fields);
}

export type { Logger } from "pino";
