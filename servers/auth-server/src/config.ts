import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("auth-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5101),
  // Cloudflare -> Apache -> Gateway -> Auth Server. The Gateway and Apache
  // are the two trusted proxy hops represented in Auth Server's forwarded
  // headers; keep this bounded instead of trusting arbitrary clients.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(2),
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
            const parsed = new URL(origin.trim());
            return parsed.protocol === "http:" || parsed.protocol === "https:";
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
  MAX_LINKED_DEVICES: z.coerce.number().int().min(1).max(20).default(5),
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
  MEDIA_SERVICE_URL: z.string().trim().url().default("http://127.0.0.1:5104"),
  RELATIONSHIP_SERVICE_URL: z
    .string()
    .trim()
    .url()
    .default("http://127.0.0.1:5109"),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(250 * 1024 * 1024)
    .default(50 * 1024 * 1024),
  INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z
    .string()
    .trim()
    .min(1)
    .default("terqivo-services"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type AuthServerConfig = z.infer<typeof environmentSchema>;

export function createAuthServerConfig(
  input: Record<string, string | undefined> = process.env,
): AuthServerConfig {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid auth-server configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ")}`,
    );
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.INTERNAL_SERVICE_SECRET === undefined
  ) {
    throw new Error(
      "Invalid auth-server configuration: INTERNAL_SERVICE_SECRET is required in production",
    );
  }
  return parsed.data;
}
