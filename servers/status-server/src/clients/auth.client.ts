import { AppError } from "../core/errors.js";
import { issueServiceToken } from "../auth/service-auth.js";
import type { StatusServerConfig } from "../config.js";

export interface AuthContext { userId: string; sessionId: string; }
export type AccountType = "personal" | "professional" | "business";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  accountType: AccountType;
  badges: string[];
  accountStatus: "active" | "suspended" | "disabled";
}

export interface AuthClient {
  validateAccessToken(accessToken: string): Promise<AuthContext>;
  batchPublicUsers(userIds: string[]): Promise<PublicUser[]>;
}

export class HttpAuthClient implements AuthClient {
  public constructor(private readonly config: StatusServerConfig) {}

  public async validateAccessToken(accessToken: string): Promise<AuthContext> {
    return this.request<AuthContext>("/internal/auth/validate", { headers: { Authorization: `Bearer ${accessToken}` } }, true);
  }

  public async batchPublicUsers(userIds: string[]): Promise<PublicUser[]> {
    return this.request<PublicUser[]>("/internal/users/batch-public", { method: "POST", body: JSON.stringify({ userIds }), headers: { "Content-Type": "application/json" } });
  }

  private async request<T>(path: string, options: RequestInit = {}, accessToken = false): Promise<T> {
    let token: string;
    try { token = await issueServiceToken(this.config); }
    catch { throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 }); }
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("x-internal-service-token", token);
    try {
      const response = await fetch(`${this.config.AUTH_SERVICE_URL}${path}`, { ...options, headers, signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => undefined) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | undefined;
      if (!response.ok || body?.success === false) {
        if (accessToken && (response.status === 401 || response.status === 403)) throw new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 });
        throw new AppError({ code: body?.error?.code ?? "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 });
      }
      if (body?.data === undefined) throw new Error("missing identity data");
      return body.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 });
    }
  }
}
