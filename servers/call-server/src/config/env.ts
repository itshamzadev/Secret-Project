import "dotenv/config";
import { z } from "zod";

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value.trim().toLowerCase() === "true") return true;
  if (value.trim().toLowerCase() === "false") return false;
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("call-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5103),
  MONGODB_URI: z.string().trim().min(1),
  REDIS_URL: z.string().trim().min(1),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  ICE_SERVERS: z.string().trim().min(1).default('[{"urls":"stun:stun.l.google.com:19302"}]'),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(120).default(35),
  CALL_START_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  CALL_ACTIVE_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(14400),
  NOTIFICATION_SERVICE_URL: z.string().trim().url().optional(),
  RELATIONSHIP_SERVICE_URL: z.string().trim().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ENABLE_PUSH_NOTIFICATIONS: booleanFromEnvironment.default(true),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === "production" && (env.INTERNAL_SERVICE_SECRET === undefined || env.NOTIFICATION_SERVICE_URL === undefined || env.RELATIONSHIP_SERVICE_URL === undefined)) {
  throw new Error("Call server production configuration requires internal authentication, notification, and relationship service endpoints.");
}
export const allowedWebOrigins = env.WEB_ORIGIN.split(",").map((value) => value.trim());
export type CallServerConfig = typeof env;
