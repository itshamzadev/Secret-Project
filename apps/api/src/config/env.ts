import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  MONGODB_URI: z.string().trim().min(1),
  REDIS_URL: z.string().trim().min(1),
  WEB_ORIGIN: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) =>
        value.split(",").every((origin) => {
          try {
            const parsedOrigin = new URL(origin.trim());
            return (
              parsedOrigin.protocol === "http:" ||
              parsedOrigin.protocol === "https:"
            );
          } catch {
            return false;
          }
        }),
      "must contain one or more valid HTTP(S) origins separated by commas",
    ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  AUTH_REGISTER_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(10),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(20),
  AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(60),
  ICE_SERVERS: z
    .string()
    .trim()
    .min(1)
    .default('[{"urls":"stun:stun.l.google.com:19302"}]'),
  CALL_RING_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(15)
    .max(120)
    .default(35),
  CALL_START_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(10),
  CALL_ACTIVE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86400)
    .default(14400),
  EXPO_PUSH_API_URL: z
    .string()
    .url()
    .default("https://exp.host/--/api/v2/push/send"),
  EXPO_ACCESS_TOKEN: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map(
      (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
    )
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnvironment.data;

export const allowedWebOrigins = env.WEB_ORIGIN.split(",").map((origin) =>
  origin.trim(),
);
