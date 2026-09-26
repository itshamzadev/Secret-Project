import "dotenv/config";

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().trim().min(1).default("relationship-server"),
  SERVICE_VERSION: z.string().trim().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5109),
  MONGODB_URI: z.string().trim().min(1),
  AUTH_SERVICE_URL: z.string().trim().url(),
  INTERNAL_SERVICE_SECRET: z.string().min(32).optional(),
  INTERNAL_SERVICE_ISSUER: z.string().trim().min(1).default("terqivo-internal"),
  INTERNAL_SERVICE_AUDIENCE: z.string().trim().min(1).default("terqivo-services"),
  WEB_ORIGIN: z.string().trim().min(1).default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const env = schema.parse(process.env);
if (env.NODE_ENV === "production" && env.INTERNAL_SERVICE_SECRET === undefined) {
  throw new Error("INTERNAL_SERVICE_SECRET is required in production");
}
export type RelationshipConfig = typeof env;
