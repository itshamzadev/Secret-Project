import { createReadStream } from "node:fs";
import { access, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { W_OK } from "node:constants";
import { isAbsolute, join, resolve, sep } from "node:path";
import type { ReadStream } from "node:fs";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { logger } from "../../lib/logger.js";

export interface MediaFile {
  stream: ReadStream;
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

const localMediaStorage =
  env.MEDIA_STORAGE_DRIVER === "local"
    ? new LocalMediaStorage(env.MEDIA_STORAGE_PATH)
    : null;

export const mediaStorage: MediaStorage =
  localMediaStorage ?? new UnconfiguredMediaStorage();

export async function initializeMediaStorage(): Promise<void> {
  if (localMediaStorage === null) return;
  await localMediaStorage.initialize();
  logger.info(
    { driver: "local", path: env.MEDIA_STORAGE_PATH },
    "Media storage initialized",
  );
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
