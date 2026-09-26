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
  SERVICE_NAME: z.string().trim().min(1).default("notification-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5105),
  MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017/terqivo"),
  REDIS_URL: z.string().trim().min(1).default("redis://127.0.0.1:6379"),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32).default("test-access-secret-change-me-1234567890"),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  EXPO_PUSH_API_URL: z.string().url().default("https://exp.host/--/api/v2/push/send"),
  EXPO_PUSH_RECEIPTS_URL: z.string().url().default("https://exp.host/--/api/v2/push/getReceipts"),
  EXPO_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  PUSH_RECEIPT_DELAY_MS: z.coerce.number().int().min(0).max(120000).default(15000),
  NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(250).max(60000).default(5000),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  NOTIFICATION_RETRY_BASE_MS: z.coerce.number().int().min(100).max(3600000).default(1000),
  NOTIFICATION_RETRY_MAX_MS: z.coerce.number().int().min(100).max(86400000).default(60000),
  INTERNAL_SERVICE_SECRET: z.string().min(32).default("test-internal-secret-change-me-1234567890"),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  ENABLE_NOTIFICATION_WORKER: booleanFromEnvironment.default(true),
});

export type NotificationServerConfig = z.infer<typeof schema>;

export function createNotificationServerConfig(
  input: Record<string, string | undefined> = process.env,
): NotificationServerConfig {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid notification-server configuration: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  if (result.data.NODE_ENV === "production" && input.JWT_ACCESS_SECRET === undefined) {
    throw new Error("JWT_ACCESS_SECRET is required in production");
  }
  if (result.data.NODE_ENV === "production" && input.INTERNAL_SERVICE_SECRET === undefined) {
    throw new Error("INTERNAL_SERVICE_SECRET is required in production");
  }
  return result.data;
}

export const env = createNotificationServerConfig();
