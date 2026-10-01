import type { AdminServerConfig } from "../config/env.js";
import { callInternal } from "./http.js";
import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { AppError } from "../core/errors.js";
import { issueServiceToken } from "../internal/service-auth.js";

export interface AuthAdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  bio: string | null;
  accountStatus: "active" | "suspended" | "disabled";
  role: "user" | "moderator" | "admin";
  accountType: "personal" | "professional" | "business";
  userTier: "normal" | "special" | "special_pro" | "ultra_special";
  badges: ("verified" | "terqivo")[];
  createdAt: string;
  lastSeenAt: string | null;
  appVersions: Array<{
    version: string | null;
    build: number | null;
    platform: string;
    deviceName: string;
    lastUsedAt: string;
    active: boolean;
  }>;
}

export interface AuthAdminStats {
  users: { total: number; active: number; suspended: number; disabled: number };
}

export async function listUsers(
  config: AdminServerConfig,
  query: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) search.set(key, String(value));
  return callInternal<{
    success: true;
    data: { users: AuthAdminUser[]; nextCursor: string | null };
  }>(
    config,
    config.AUTH_SERVICE_URL,
    `/internal/admin/users?${search.toString()}`,
  );
}

export async function getUserStats(config: AdminServerConfig) {
  return callInternal<{ success: true; data: AuthAdminStats }>(
    config,
    config.AUTH_SERVICE_URL,
    "/internal/admin/stats",
  );
}

export async function getUsersByIds(
  config: AdminServerConfig,
  userIds: string[],
) {
  return callInternal<{
    success: true;
    data: Array<{
      id: string;
      username: string;
      displayName: string;
      accountStatus: "active" | "suspended" | "disabled";
    }>;
  }>(config, config.AUTH_SERVICE_URL, "/internal/admin/users/batch-public", {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export async function validateUserAccessToken(
  config: AdminServerConfig,
  accessToken: string,
) {
  return callInternal<{
    success: true;
    data: { userId: string; sessionId: string };
  }>(config, config.AUTH_SERVICE_URL, "/internal/auth/validate", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updateUserPassword(
  config: AdminServerConfig,
  userId: string,
  password: string,
) {
  return callInternal<{
    success: true;
    data: { updated: true; revokedSessions: number };
  }>(
    config,
    config.AUTH_SERVICE_URL,
    `/internal/admin/users/${userId}/password`,
    { method: "PATCH", body: JSON.stringify({ password }) },
  );
}

export async function streamUserAvatar(
  config: AdminServerConfig,
  userId: string,
  response: ExpressResponse,
): Promise<void> {
  const token = await issueServiceToken(config);
  let upstream: Response;
  try {
    upstream = await fetch(
      `${config.AUTH_SERVICE_URL}/internal/admin/users/${encodeURIComponent(userId)}/avatar`,
      {
        headers: {
          Accept: "image/*",
          "x-internal-service-token": token,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new AppError({
      code: "ADMIN_DEPENDENCY_UNAVAILABLE",
      message: "An administrative dependency is unavailable.",
      statusCode: 503,
    });
  }

  if (!upstream.ok) {
    const body = (await upstream.json().catch(() => undefined)) as
      | { error?: { code?: unknown; message?: unknown } }
      | undefined;
    const code = typeof body?.error?.code === "string" ? body.error.code : "AVATAR_NOT_FOUND";
    const message = typeof body?.error?.message === "string" ? body.error.message : "The avatar was not found.";
    throw new AppError({ code, message, statusCode: upstream.status === 404 ? 404 : 503 });
  }

  response.setHeader("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength !== null) response.setHeader("Content-Length", contentLength);
  response.setHeader("Cache-Control", "private, max-age=300");
  if (upstream.body !== null) {
    await pipeline(Readable.fromWeb(upstream.body as ReadableStream), response);
  }
}
export async function updateUserStatus(
  config: AdminServerConfig,
  userId: string,
  status: string,
) {
  return callInternal<{
    success: true;
    data: { updated: true; status: string; revokedSessions: number };
  }>(
    config,
    config.AUTH_SERVICE_URL,
    `/internal/admin/users/${userId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}
export async function updateUserTier(
  config: AdminServerConfig,
  userId: string,
  userTier: string,
) {
  return callInternal<{
    success: true;
    data: { updated: true; userTier: string };
  }>(config, config.AUTH_SERVICE_URL, `/internal/admin/users/${userId}/tier`, {
    method: "PATCH",
    body: JSON.stringify({ userTier }),
  });
}
export async function updateUserBadges(
  config: AdminServerConfig,
  userId: string,
  badges: string[],
) {
  return callInternal<{
    success: true;
    data: { updated: true; badges: string[] };
  }>(
    config,
    config.AUTH_SERVICE_URL,
    `/internal/admin/users/${userId}/badges`,
    { method: "PATCH", body: JSON.stringify({ badges }) },
  );
}
export async function disableUser(config: AdminServerConfig, userId: string) {
  return callInternal<{
    success: true;
    data: { deleted: true; revokedSessions: number };
  }>(config, config.AUTH_SERVICE_URL, `/internal/admin/users/${userId}`, {
    method: "DELETE",
  });
}
