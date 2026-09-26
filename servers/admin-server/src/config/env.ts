import "dotenv/config";
import { z } from "zod";

const url = (name: string) => z.string().trim().url(`${name} must be a valid URL`);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("admin-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5107),
  MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017/terqivo_connect"),
  REDIS_URL: url("REDIS_URL").default("redis://127.0.0.1:6379"),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  ADMIN_JWT_SECRET: z.string().min(32),
  ADMIN_JWT_ISSUER: z.string().trim().min(1).default("terqivo-admin"),
  ADMIN_JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-admin-panel"),
  ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  ADMIN_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_SERVICE_URL: url("AUTH_SERVICE_URL").default("http://127.0.0.1:5101"),
  MESSAGE_SERVICE_URL: url("MESSAGE_SERVICE_URL").default("http://127.0.0.1:5102"),
  CALL_SERVICE_URL: url("CALL_SERVICE_URL").default("http://127.0.0.1:5103"),
  NOTIFICATION_SERVICE_URL: url("NOTIFICATION_SERVICE_URL").default("http://127.0.0.1:5105"),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AdminServerConfig = z.infer<typeof schema>;

export function createAdminServerConfig(input: Record<string, string | undefined> = process.env): AdminServerConfig {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid admin-server configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ")}`);
  }
  if (parsed.data.NODE_ENV === "production" && input.INTERNAL_SERVICE_SECRET === undefined) {
    throw new Error("INTERNAL_SERVICE_SECRET is required in production");
  }
  return parsed.data;
}

export const env = createAdminServerConfig();
export const allowedWebOrigins = env.WEB_ORIGIN.split(",").map((origin) => origin.trim());
