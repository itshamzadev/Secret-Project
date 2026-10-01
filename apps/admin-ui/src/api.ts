import type {
  BadgeType,
  AdminAuthenticationResponse,
  AdminChannelListResponse,
  AdminDashboardDto,
  AdminGroupListResponse,
  AdminUserDto,
  AdminUserListResponse,
  AdminReportListResponse,
} from "@terqivo/contracts";

import { adminEnv } from "./config/env";

type ApiErrorBody = {
  success: false;
  error: { code: string; message: string };
};

type ApiSuccessBody<T> = { success: true; data: T };

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.status = status;
  }
}

export function buildAdminApiUrl(path: string): string {
  return `${adminEnv.apiBaseUrl}${path}`;
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (options.token !== undefined)
    headers.set("Authorization", `Bearer ${options.token}`);

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };
  if (options.body !== undefined)
    requestInit.body = JSON.stringify(options.body);

  const response = await fetch(buildAdminApiUrl(path), requestInit);

  const payload = (await response.json().catch(() => null)) as
    ApiSuccessBody<T> | ApiErrorBody | null;

  if (!response.ok || payload === null || payload.success !== true) {
    const errorBody =
      payload !== null && payload.success === false ? payload : null;
    throw new AdminApiError(
      errorBody?.error.message ?? "The administration service is unavailable.",
      errorBody?.error.code ?? "ADMIN_REQUEST_FAILED",
      response.status,
    );
  }

  return payload.data;
}

export const adminApi = {
  login(input: { email: string; password: string }) {
    return request<AdminAuthenticationResponse>("/admin/auth/login", {
      method: "POST",
      body: input,
    });
  },

  me(token: string) {
    return request<{ admin: AdminUserDto }>("/admin/auth/me", { token });
  },

  logout(token: string) {
    return request<{ loggedOut: boolean }>("/admin/auth/logout", {
      method: "POST",
      token,
    });
  },

  dashboard(token: string) {
    return request<AdminDashboardDto>("/admin/dashboard", { token });
  },

  users(
    token: string,
    query: { search?: string; status?: string; cursor?: string },
  ) {
    const params = new URLSearchParams();
    if (query.search !== undefined && query.search !== "")
      params.set("search", query.search);
    if (query.status !== undefined && query.status !== "all")
      params.set("status", query.status);
    if (query.cursor !== undefined) params.set("cursor", query.cursor);
    const suffix = params.toString();
    return request<AdminUserListResponse>(
      `/admin/users${suffix === "" ? "" : `?${suffix}`}`,
      { token },
    );
  },

  groups(token: string) {
    return request<AdminGroupListResponse>("/admin/groups", { token });
  },

  channels(token: string) {
    return request<AdminChannelListResponse>("/admin/channels", { token });
  },

  changeUserPassword(token: string, userId: string, password: string) {
    return request<{ updated: true; revokedSessions: number }>(
      `/admin/users/${userId}/password`,
      { method: "PATCH", token, body: { password } },
    );
  },

  async userAvatar(token: string, userId: string, signal?: AbortSignal): Promise<Blob> {
    const requestInit: RequestInit = {
      headers: {
        Accept: "image/*",
        Authorization: `Bearer ${token}`,
      },
    };
    if (signal !== undefined) requestInit.signal = signal;
    const response = await fetch(
      buildAdminApiUrl(`/admin/users/${userId}/avatar`),
      requestInit,
    );
    if (!response.ok) {
      throw new AdminApiError("The user avatar is unavailable.", "AVATAR_NOT_FOUND", response.status);
    }
    return response.blob();
  },

  setUserStatus(
    token: string,
    userId: string,
    status: "active" | "suspended" | "disabled",
  ) {
    return request<{
      updated: true;
      status: "active" | "suspended" | "disabled";
      revokedSessions: number;
    }>(`/admin/users/${userId}/status`, {
      method: "PATCH",
      token,
      body: { status },
    });
  },

  deleteUser(token: string, userId: string) {
    return request<{ deleted: true; revokedSessions: number }>(
      `/admin/users/${userId}`,
      { method: "DELETE", token },
    );
  },

  setUserTier(
    token: string,
    userId: string,
    userTier: "normal" | "special" | "special_pro" | "ultra_special",
  ) {
    return request<{ updated: true; userTier: typeof userTier }>(
      `/admin/users/${userId}/tier`,
      { method: "PATCH", token, body: { userTier } },
    );
  },

  setUserBadges(token: string, userId: string, badges: BadgeType[]) {
    return request<{ updated: true; badges: BadgeType[] }>(
      `/admin/users/${userId}/badges`,
      { method: "PATCH", token, body: { badges } },
    );
  },

  setGroupBadges(token: string, groupId: string, badges: BadgeType[]) {
    return request<{ updated: true; badges: BadgeType[] }>(
      `/admin/groups/${groupId}/badges`,
      { method: "PATCH", token, body: { badges } },
    );
  },

  setChannelBadges(token: string, channelId: string, badges: BadgeType[]) {
    return request<{ updated: true; badges: BadgeType[] }>(
      `/admin/channels/${channelId}/badges`,
      { method: "PATCH", token, body: { badges } },
    );
  },

  reports(token: string, status?: "open" | "resolved" | "dismissed") {
    const suffix =
      status === undefined ? "" : `?status=${encodeURIComponent(status)}`;
    return request<AdminReportListResponse>(`/admin/reports${suffix}`, {
      token,
    });
  },

  updateReport(
    token: string,
    reportId: string,
    status: "open" | "resolved" | "dismissed",
  ) {
    return request<{ report: AdminReportListResponse["reports"][number] }>(
      `/admin/reports/${reportId}`,
      { method: "PATCH", token, body: { status } },
    );
  },
};
