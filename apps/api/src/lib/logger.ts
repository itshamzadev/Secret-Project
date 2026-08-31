import pino, { type LoggerOptions } from "pino";

import { env } from "../config/env.js";

const sensitiveFieldNames = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "sdp",
  "candidate",
  "iceCandidate",
  "ice_candidate",
  "credential",
  "turnCredential",
  "turn_credential",
];

const nestedSensitivePaths = sensitiveFieldNames.flatMap((fieldName) => [
  `*.${fieldName}`,
  `*.*.${fieldName}`,
  `*.*.*.${fieldName}`,
]);

export const logRedaction = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.raw.headers["authorization"]',
    'req.raw.headers["cookie"]',
    'res.headers["set-cookie"]',
    'res.raw.headers["set-cookie"]',
    "authorization",
    "cookie",
    '["set-cookie"]',
    ...sensitiveFieldNames,
    ...nestedSensitivePaths,
  ],
  censor: "[REDACTED]",
} satisfies NonNullable<LoggerOptions["redact"]>;

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: logRedaction,
};

export const logger =
  env.NODE_ENV === "development"
    ? pino({
        ...loggerOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
      })
    : pino(loggerOptions);
