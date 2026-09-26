import { createServiceToken } from "../auth/service-token.js";
import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";

export interface AuthContext { userId: string; sessionId: string; }
export interface AuthClient { validateAccessToken(accessToken: string): Promise<AuthContext>; }

export class AuthServerClient implements AuthClient {
  public constructor(private readonly baseUrl = env.AUTH_SERVICE_URL) {}

  public async validateAccessToken(accessToken: string): Promise<AuthContext> {
    let token: string;
    try { token = await createServiceToken(); } catch { throw unavailable(); }
    try {
      const response = await fetch(`${this.baseUrl}/internal/auth/validate`, { headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "x-internal-service-token": token }, signal: AbortSignal.timeout(5_000) });
      const body = await response.json().catch(() => undefined) as { success?: boolean; data?: AuthContext; error?: { code?: string } } | undefined;
      if (response.status === 401) throw new AppError({ code: body?.error?.code ?? "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 });
      if (!response.ok || body?.success !== true || body.data === undefined) throw unavailable();
      return body.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable();
    }
  }
}

function unavailable(): AppError { return new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 }); }
