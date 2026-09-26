import { Readable } from "node:stream";

import { AppError } from "../core/errors.js";
import { issueServiceToken } from "../auth/service-auth.js";
import type { StatusServerConfig } from "../config.js";

export interface MediaFile { stream: Readable; size: number; }
export interface MediaClient {
  put(storageKey: string, data: Buffer): Promise<void>;
  open(storageKey: string, mimeType: string): Promise<MediaFile | null>;
  remove(storageKey: string): Promise<void>;
}

export class HttpMediaClient implements MediaClient {
  public constructor(private readonly config: StatusServerConfig) {}

  public async put(storageKey: string, data: Buffer): Promise<void> {
    const response = await this.request(`/internal/media/files/${encodeURIComponent(storageKey)}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(data.length) }, body: data as unknown as BodyInit });
    if (!response.ok) throw mediaUnavailable();
  }

  public async open(storageKey: string, mimeType: string): Promise<MediaFile | null> {
    const response = await this.request(`/internal/media/files/${encodeURIComponent(storageKey)}`, { headers: { "x-media-mime-type": mimeType } });
    if (response.status === 404) return null;
    if (!response.ok || response.body === null) throw mediaUnavailable();
    const size = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size < 0) throw mediaUnavailable();
    return { stream: Readable.fromWeb(response.body as never), size };
  }

  public async remove(storageKey: string): Promise<void> {
    const response = await this.request(`/internal/media/files/${encodeURIComponent(storageKey)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw mediaUnavailable();
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    let token: string;
    try { token = await issueServiceToken(this.config); }
    catch { throw mediaUnavailable(); }
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json, application/octet-stream");
    headers.set("x-internal-service-token", token);
    try { return await fetch(`${this.config.MEDIA_SERVICE_URL}${path}`, { ...options, headers, signal: AbortSignal.timeout(30_000) }); }
    catch { throw mediaUnavailable(); }
  }
}

function mediaUnavailable(): AppError { return new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 }); }
