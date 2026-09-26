import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { z } from "zod";

import { parseDistributedEnvironment } from "@terqivo/config";

const serviceTokenClaimsSchema = z.object({
  iss: z.string().min(1),
  aud: z.string().min(1),
  sub: z.string().min(1),
  serviceName: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type ServiceTokenClaims = z.infer<typeof serviceTokenClaimsSchema>;

export interface ServiceAuthOptions {
  serviceName: string;
  issuer: string;
  audience: string;
  secret: string;
  ttlSeconds?: number;
  clockToleranceSeconds?: number;
}

export interface IssueServiceTokenOptions {
  subject?: string;
  audience?: string;
  ttlSeconds?: number;
}

export interface VerifyServiceTokenOptions {
  expectedServiceName?: string;
  audience?: string;
}

export class ServiceAuthError extends Error {
  public readonly code = "SERVICE_TOKEN_INVALID" as const;

  public constructor(message = "The internal service token is invalid.") {
    super(message);
    this.name = "ServiceAuthError";
  }
}

function ensureSecret(secret: string): Uint8Array {
  if (secret.length < 32) {
    throw new Error(
      "Internal service authentication secrets must be at least 32 characters.",
    );
  }

  return new TextEncoder().encode(secret);
}

function ensurePositiveTtl(ttlSeconds: number): number {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) {
    throw new Error("Service token TTL must be an integer between 1 and 900 seconds.");
  }

  return ttlSeconds;
}

function claimsFromPayload(payload: JWTPayload): ServiceTokenClaims {
  const parsed = serviceTokenClaimsSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ServiceAuthError("The internal service token claims are invalid.");
  }

  return parsed.data;
}

export function createServiceAuth(options: ServiceAuthOptions) {
  const key = ensureSecret(options.secret);
  const defaultTtlSeconds = ensurePositiveTtl(options.ttlSeconds ?? 60);
  const clockToleranceSeconds = options.clockToleranceSeconds ?? 5;

  if (
    !Number.isInteger(clockToleranceSeconds) ||
    clockToleranceSeconds < 0 ||
    clockToleranceSeconds > 60
  ) {
    throw new Error("Service token clock tolerance must be between 0 and 60 seconds.");
  }

  return {
    async issueToken(
      input: IssueServiceTokenOptions = {},
    ): Promise<string> {
      const ttlSeconds = ensurePositiveTtl(input.ttlSeconds ?? defaultTtlSeconds);

      return new SignJWT({ serviceName: options.serviceName })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(options.issuer)
        .setAudience(input.audience ?? options.audience)
        .setSubject(input.subject ?? options.serviceName)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(key);
    },

    async verifyToken(
      token: string,
      input: VerifyServiceTokenOptions = {},
    ): Promise<ServiceTokenClaims> {
      try {
        const verified = await jwtVerify(token, key, {
          issuer: options.issuer,
          audience: input.audience ?? options.audience,
          algorithms: ["HS256"],
          clockTolerance: clockToleranceSeconds,
        });
        const claims = claimsFromPayload(verified.payload);

        if (
          input.expectedServiceName !== undefined &&
          claims.serviceName !== input.expectedServiceName
        ) {
          throw new ServiceAuthError("The internal service identity is invalid.");
        }

        return claims;
      } catch (error) {
        if (error instanceof ServiceAuthError) {
          throw error;
        }

        throw new ServiceAuthError();
      }
    },
  };
}

export function createServiceAuthFromEnvironment(
  input: Record<string, string | undefined> = process.env,
) {
  const environment = parseDistributedEnvironment(input, {
    requireInternalServiceSecret: true,
  });

  if (environment.INTERNAL_SERVICE_AUTH_SECRET === undefined) {
    throw new Error("Internal service authentication secret is not configured.");
  }

  return createServiceAuth({
    serviceName: environment.SERVICE_NAME,
    issuer: environment.INTERNAL_SERVICE_AUTH_ISSUER,
    audience: environment.INTERNAL_SERVICE_AUTH_AUDIENCE,
    secret: environment.INTERNAL_SERVICE_AUTH_SECRET,
  });
}
