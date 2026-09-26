import { createServiceToken } from "../auth/service-token.js";
import { AppError } from "../core/errors.js";
import { env } from "../config/env.js";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  accountType: "personal" | "professional" | "business";
  badges: string[];
  accountStatus: "active" | "suspended" | "disabled";
}
export interface AuthContext { userId: string; sessionId: string; }
export interface PrivacySettings {
  profilePhoto: "everyone" | "contacts" | "nobody";
  lastSeen: "everyone" | "contacts" | "nobody";
  readReceipts: boolean;
  messageRequests: "everyone" | "contacts";
  updatedAt: string;
}

export class AuthDirectoryClient {
  public constructor(private readonly baseUrl = env.AUTH_SERVICE_URL) {}

  public async validateAccessToken(accessToken: string): Promise<AuthContext> {
    const result = await this.request<{ userId: string; sessionId: string }>("/internal/auth/validate", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return result;
  }

  public async resolveIdentifier(identifier: string): Promise<PublicUser | null> {
    try { return await this.request<PublicUser>(`/internal/users/resolve?identifier=${encodeURIComponent(identifier)}`); }
    catch (error) { if (error instanceof AppError && error.statusCode === 404) return null; throw error; }
  }

  public async searchUsers(query: string): Promise<PublicUser[]> {
    return this.request<PublicUser[]>(`/internal/users/search?query=${encodeURIComponent(query)}`);
  }

  public async batchPublicUsers(userIds: string[]): Promise<PublicUser[]> {
    return this.request<PublicUser[]>("/internal/users/batch-public", { method: "POST", body: JSON.stringify({ userIds }), headers: { "Content-Type": "application/json" } });
  }

  public async getPrivacy(userId: string): Promise<PrivacySettings> {
    return this.request<PrivacySettings>(`/internal/users/${encodeURIComponent(userId)}/privacy`);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let token: string;
    try { token = await createServiceToken("relationship-server"); }
    catch { throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 }); }
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("x-internal-service-token", token);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers, signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => undefined) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | undefined;
      if (!response.ok || body?.success === false) {
        const status = response.status === 404 ? 404 : response.status === 401 || response.status === 403 ? response.status : 503;
        throw new AppError({ code: body?.error?.code ?? "AUTH_SERVICE_UNAVAILABLE", message: status === 404 ? "The user was not found." : "The identity service is unavailable.", statusCode: status });
      }
      if (body?.data === undefined) throw new Error("missing identity data");
      return body.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 });
    }
  }
}
