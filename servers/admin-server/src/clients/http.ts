import { randomUUID } from "node:crypto";

import type { AdminServerConfig } from "../config/env.js";
import { AppError } from "../core/errors.js";
import { issueServiceToken } from "../internal/service-auth.js";

export async function callInternal<T>(config: AdminServerConfig, baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await issueServiceToken(config);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("x-internal-service-token", token);
  headers.set("x-request-id", randomUUID());
  headers.set("x-correlation-id", randomUUID());
  let response: Response;
  try {
    response = await fetch(new URL(path, `${baseUrl}/`), { ...init, headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AppError({ code: "ADMIN_DEPENDENCY_UNAVAILABLE", message: "An administrative dependency is unavailable.", statusCode: 503 });
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = typeof body === "object" && body !== null && "error" in body ? body.error : undefined;
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "ADMIN_DEPENDENCY_ERROR";
    const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : "An administrative dependency rejected the request.";
    throw new AppError({ code, message, statusCode: response.status >= 500 ? 503 : response.status });
  }
  return body as T;
}
