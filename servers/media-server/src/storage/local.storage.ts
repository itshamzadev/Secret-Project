import { createReadStream } from "node:fs";
import { access, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { W_OK } from "node:constants";
import { isAbsolute, join, resolve, sep } from "node:path";

import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";
import type { MediaFile, MediaStorage } from "./storage.interface.js";

export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  public constructor(directory = env.MEDIA_STORAGE_PATH) {
    this.root = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
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
    try { await unlink(this.safePath(key)); }
    catch (error: unknown) { if (!isNodeError(error) || error.code !== "ENOENT") throw error; }
  }

  public async open(key: string, range?: { start: number; end: number }): Promise<MediaFile | null> {
    try {
      const filePath = this.safePath(key);
      const file = await stat(filePath);
      const start = range?.start ?? 0;
      const end = range?.end ?? Math.max(0, file.size - 1);
      if (start < 0 || start > end || start >= file.size || end >= file.size) {
        throw new AppError({ code: "MEDIA_RANGE_NOT_SATISFIABLE", message: "The requested media range is not satisfiable.", statusCode: 416 });
      }
      return { stream: createReadStream(filePath, { start, end }), size: end - start + 1 };
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try { await stat(this.safePath(key)); return true; }
    catch (error: unknown) { if (isNodeError(error) && error.code === "ENOENT") return false; throw error; }
  }

  public safePath(key: string): string {
    if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(key)) {
      throw new AppError({ code: "INVALID_MEDIA_KEY", message: "The media reference is invalid.", statusCode: 400 });
    }
    const filePath = join(this.root, key);
    if (!filePath.startsWith(`${this.root}${sep}`) && !filePath.startsWith(`${this.root}/`)) {
      throw new AppError({ code: "INVALID_MEDIA_KEY", message: "The media reference is invalid.", statusCode: 400 });
    }
    return filePath;
  }
}

export class UnconfiguredMediaStorage implements MediaStorage {
  public async initialize(): Promise<void> { throw storageUnavailable(); }
  public async put(key: string, data: Buffer): Promise<void> { void key; void data; throw storageUnavailable(); }
  public async remove(key: string): Promise<void> { void key; throw storageUnavailable(); }
  public async open(key: string, range?: { start: number; end: number }): Promise<MediaFile | null> { void key; void range; throw storageUnavailable(); }
  public async exists(key: string): Promise<boolean> { void key; throw storageUnavailable(); }
}

function storageUnavailable(): AppError {
  return new AppError({ code: "MEDIA_STORAGE_NOT_CONFIGURED", message: "Media storage is not configured for this environment.", statusCode: 503 });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
