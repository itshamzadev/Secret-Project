import "dotenv/config";
import { z } from "zod";

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("message-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5102),
  MONGODB_URI: z.string().trim().min(1),
  REDIS_URL: z.string().trim().min(1),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  E2EFE_ENFORCEMENT_ENABLED: booleanFromEnvironment.default(false),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1024).max(250 * 1024 * 1024).default(50 * 1024 * 1024),
  MEDIA_SERVICE_URL: z.string().trim().url().optional(),
  NOTIFICATION_SERVICE_URL: z.string().trim().url().optional(),
  RELATIONSHIP_SERVICE_URL: z.string().trim().url().optional(),
  INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === "production" && (env.MEDIA_SERVICE_URL === undefined || env.NOTIFICATION_SERVICE_URL === undefined || env.RELATIONSHIP_SERVICE_URL === undefined || env.INTERNAL_SERVICE_SECRET === undefined || !env.E2EFE_ENFORCEMENT_ENABLED)) {
  throw new Error("Message server production configuration requires media, notification, relationship, and internal service endpoints/authentication with E2EFE enforcement enabled.");
}
export type MessageServerConfig = typeof env;
