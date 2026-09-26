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
  SERVICE_NAME: z.string().trim().min(1).default("media-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5104),
  MONGODB_URI: z.string().trim().min(1),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_STORAGE_PATH: z.string().trim().min(1).default("./storage/media"),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1024).max(250 * 1024 * 1024).default(50 * 1024 * 1024),
  MESSAGE_SERVICE_URL: z.string().trim().url().optional(),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  ENABLE_STORAGE_RECORDS: booleanFromEnvironment.default(false),
});

export const env = schema.parse(process.env);
export type MediaServerConfig = typeof env;
