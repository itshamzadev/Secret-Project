import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { access, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { W_OK } from "node:constants";
import { isAbsolute, join, resolve, sep } from "node:path";
import { SignJWT } from "jose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { logger } from "../../lib/logger.js";

export interface MediaFile {
  stream: Readable;
  size: number;
}

export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  open(key: string): Promise<MediaFile | null>;
}

function storageUnavailable(): AppError {
  return new AppError({
    code: "MEDIA_STORAGE_NOT_CONFIGURED",
    message: "Media storage is not configured for this environment.",
    statusCode: 503,
  });
}

class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  public constructor(directory: string) {
    this.root = isAbsolute(directory)
      ? directory
      : resolve(process.cwd(), directory);
  }

  public async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, W_OK);
  }

  public async put(key: string, data: Buffer): Promise<void> {
    await this.initialize();
    await writeFile(this.safePath(key), data, { flag: "wx" });
  }

  public async remove(key: string): Promise<void> {
    try {
      await unlink(this.safePath(key));
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") return;
      throw error;
    }
  }

  public async open(key: string): Promise<MediaFile | null> {
    try {
      const filePath = this.safePath(key);
      const file = await stat(filePath);
      return { stream: createReadStream(filePath), size: file.size };
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private safePath(key: string): string {
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) {
      throw new AppError({
        code: "INVALID_MEDIA_KEY",
        message: "The media reference is invalid.",
        statusCode: 400,
      });
    }
    const filePath = join(this.root, key);
    if (
      !filePath.startsWith(`${this.root}${sep}`) &&
      !filePath.startsWith(`${this.root}/`)
    ) {
      throw new AppError({
        code: "INVALID_MEDIA_KEY",
        message: "The media reference is invalid.",
        statusCode: 400,
      });
    }
    return filePath;
  }
}

class UnconfiguredMediaStorage implements MediaStorage {
  public async put(_key: string, _data: Buffer): Promise<void> {
    throw storageUnavailable();
  }

  public async remove(_key: string): Promise<void> {
    throw storageUnavailable();
  }

  public async open(_key: string): Promise<MediaFile | null> {
    throw storageUnavailable();
  }
}

class MediaServiceStorage implements MediaStorage {
  public async put(key: string, data: Buffer): Promise<void> {
    await this.request(`/internal/media/files/${encodeURIComponent(key)}`, "PUT", data);
  }

  public async remove(key: string): Promise<void> {
    await this.request(`/internal/media/files/${encodeURIComponent(key)}`, "DELETE");
  }

  public async open(key: string): Promise<MediaFile | null> {
    const response = await this.request(`/internal/media/files/${encodeURIComponent(key)}`, "GET", undefined, true);
    if (response === null || response.body === null) return null;
    return {
      stream: Readable.fromWeb(response.body as ReadableStream),
      size: Number(response.headers.get("content-length") ?? 0),
    };
  }

  private async request(path: string, method: "GET" | "PUT" | "DELETE", body?: Buffer, allowNotFound = false): Promise<Response | null> {
    if (env.MEDIA_SERVICE_URL === undefined || env.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 });
    const requestInit: RequestInit = {
      method,
      headers: { "x-internal-service-token": await mediaServiceToken(), ...(body === undefined ? {} : { "content-type": "application/octet-stream" }) },
      signal: AbortSignal.timeout(30_000),
    };
    if (body !== undefined) requestInit.body = new Uint8Array(body);
    const response = await fetch(`${env.MEDIA_SERVICE_URL}${path}`, requestInit).catch(() => { throw new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 }); });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) throw new AppError({ code: response.status >= 500 ? "MEDIA_SERVICE_UNAVAILABLE" : "MEDIA_STORAGE_ERROR", message: response.status >= 500 ? "Media storage is temporarily unavailable." : "The media operation was rejected.", statusCode: response.status >= 500 ? 503 : response.status });
    return response;
  }
}

const localMediaStorage =
  env.MEDIA_STORAGE_DRIVER === "local"
    ? new LocalMediaStorage(env.MEDIA_STORAGE_PATH)
    : null;

export const mediaStorage: MediaStorage =
  env.MEDIA_SERVICE_URL !== undefined
    ? new MediaServiceStorage()
    : localMediaStorage ?? new UnconfiguredMediaStorage();

export async function initializeMediaStorage(): Promise<void> {
  if (localMediaStorage === null || env.MEDIA_SERVICE_URL !== undefined) return;
  await localMediaStorage.initialize();
  logger.info(
    { driver: "local", path: env.MEDIA_STORAGE_PATH },
    "Media storage initialized",
  );
}

async function mediaServiceToken(): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 });
  return new SignJWT({ serviceName: "legacy-api" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject("legacy-api")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
