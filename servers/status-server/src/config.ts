import "dotenv/config";

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("status-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5110),
  MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017/terqivo"),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  AUTH_SERVICE_URL: z.string().trim().url().default("http://127.0.0.1:5101"),
  RELATIONSHIP_SERVICE_URL: z.string().trim().url().default("http://127.0.0.1:5109"),
  MEDIA_SERVICE_URL: z.string().trim().url().default("http://127.0.0.1:5104"),
  INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  STATUS_MAX_MEDIA_SIZE_BYTES: z.coerce.number().int().min(1024).max(250 * 1024 * 1024).default(50 * 1024 * 1024),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
});

export type StatusServerConfig = z.infer<typeof schema>;

export function createStatusServerConfig(input: Record<string, string | undefined> = process.env): StatusServerConfig {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid status-server configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ")}`);
  if (parsed.data.NODE_ENV === "production" && parsed.data.INTERNAL_SERVICE_SECRET === undefined) throw new Error("Invalid status-server configuration: INTERNAL_SERVICE_SECRET is required in production");
  return parsed.data;
}
