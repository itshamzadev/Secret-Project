import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("realtime-hub"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5108),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  REDIS_URL: z.string().trim().min(1),
  AUTH_SERVICE_URL: z.string().trim().url(),
  MESSAGE_SERVICE_URL: z.string().trim().url(),
  CALL_SERVICE_URL: z.string().trim().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(15_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export const env = schema.parse(process.env);
export const allowedWebOrigins = env.WEB_ORIGIN.split(",").map((origin) => origin.trim());
export type RealtimeHubConfig = typeof env;
