import { randomUUID } from "node:crypto";

import { env } from "../config/env.js";
import { RealtimeError } from "../core/errors.js";
import { issueServiceToken } from "../internal/service-auth.js";

export interface ApiEnvelope {
  success: boolean;
  data?: unknown;
  error?: { code?: unknown; message?: unknown };
}

export async function requestInternal<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; accessToken?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-internal-service-token": await issueServiceToken(),
    "x-request-id": randomUUID(),
    "x-correlation-id": randomUUID()
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.accessToken !== undefined) headers.authorization = `Bearer ${options.accessToken}`;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(env.UPSTREAM_TIMEOUT_MS)
    });
  } catch {
    throw new RealtimeError("REALTIME_UPSTREAM_UNAVAILABLE", "The realtime upstream is temporarily unavailable.", 503);
  }
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    const code = typeof envelope?.error?.code === "string" ? envelope.error.code : "REALTIME_UPSTREAM_UNAVAILABLE";
    const message = typeof envelope?.error?.message === "string" ? envelope.error.message : "The realtime upstream is temporarily unavailable.";
    throw new RealtimeError(code, message, response.status >= 500 ? 503 : response.status);
  }
  return envelope.data as T;
}
