import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("search-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5106),
  AUTH_SERVICE_URL: z.string().url(),
  INTERNAL_SERVICE_SECRET: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().min(32).optional()),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  REDIS_URL: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().url().optional()),
  SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(30),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(20),
  GEMINI_API_KEY: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().min(1).optional()),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.7-flash"),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid search-server configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`).join("; ")}`);
if (parsed.data.NODE_ENV === "production" && parsed.data.INTERNAL_SERVICE_SECRET === undefined) throw new Error("Invalid search-server configuration: INTERNAL_SERVICE_SECRET is required in production");

export const env = parsed.data;
