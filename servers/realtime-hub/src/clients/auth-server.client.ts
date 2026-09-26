import { env } from "../config/env.js";
import { requestInternal } from "./http.js";

export async function getAuthenticatedUser(accessToken: string): Promise<unknown> {
  return requestInternal<unknown>(env.AUTH_SERVICE_URL, "/api/v1/auth/me", {
    accessToken
  });
}

export async function recordPresenceStart(userId: string, sessionId: string): Promise<void> {
  await requestInternal<unknown>(env.AUTH_SERVICE_URL, "/internal/presence/start", { method: "POST", body: { userId, sessionId } });
}

export async function recordPresenceEnd(userId: string): Promise<void> {
  await requestInternal<unknown>(env.AUTH_SERVICE_URL, "/internal/presence/end", { method: "POST", body: { userId } });
}
