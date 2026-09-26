import { z } from "zod";

const nodeEnvironmentSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const portSchema = z.coerce.number().int().min(1).max(65535);

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const distributedEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  SERVICE_NAME: z.string().trim().min(1).default("terqivo-service"),
  SERVICE_PORT: portSchema.default(5000),
  INTERNAL_SERVICE_AUTH_ISSUER: z
    .string()
    .trim()
    .min(1)
    .default("terqivo-internal"),
  INTERNAL_SERVICE_AUTH_AUDIENCE: z
    .string()
    .trim()
    .min(1)
    .default("terqivo-services"),
  INTERNAL_SERVICE_AUTH_SECRET: optionalTrimmedString,
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type DistributedEnvironment = z.infer<
  typeof distributedEnvironmentSchema
>;

export interface ParseServiceEnvironmentOptions {
  requireInternalServiceSecret?: boolean;
}

export function parseDistributedEnvironment(
  input: Record<string, string | undefined> = process.env,
  options: ParseServiceEnvironmentOptions = {},
): DistributedEnvironment {
  const parsed = distributedEnvironmentSchema.safeParse(input);

  if (!parsed.success) {
    throw new Error(
      `Invalid distributed service configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  if (
    options.requireInternalServiceSecret === true &&
    (parsed.data.INTERNAL_SERVICE_AUTH_SECRET === undefined ||
      parsed.data.INTERNAL_SERVICE_AUTH_SECRET.length < 32)
  ) {
    throw new Error(
      "INTERNAL_SERVICE_AUTH_SECRET must be at least 32 characters when service authentication is enabled.",
    );
  }

  return parsed.data;
}

export const servicePortDefaults = {
  gateway: 5000,
  auth: 5101,
  message: 5102,
  call: 5103,
  media: 5104,
  notification: 5105,
  search: 5106,
  admin: 5107,
} as const;
