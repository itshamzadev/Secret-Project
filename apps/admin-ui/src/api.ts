import type {
  AdminAuthenticationResponse,
  AdminDashboardDto,
  AdminUserDto,
  AdminUserListResponse,
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
};
