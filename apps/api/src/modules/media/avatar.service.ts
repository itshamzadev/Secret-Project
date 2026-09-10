import { randomUUID } from "node:crypto";
import type { ReadStream } from "node:fs";

import { AppError } from "../../core/errors.js";
import { inspectMedia } from "./media.validation.js";
import { mediaStorage } from "./media.storage.js";

export interface StoredAvatar {
  storageKey: string;
  mimeType: string;
  extension: string;
}

export async function storeAvatar(data: Buffer): Promise<StoredAvatar> {
  const detected = await inspectMedia(data);
  if (detected === null || !detected.mimeType.startsWith("image/")) {
    throw new AppError({
      code: "AVATAR_TYPE_NOT_ALLOWED",
      message: "Choose a valid image for the avatar.",
      statusCode: 415,
    });
  }
  const storageKey = `${randomUUID()}.${detected.extension}`;
  await mediaStorage.put(storageKey, data);
  return {
    storageKey,
    mimeType: detected.mimeType,
    extension: detected.extension,
  };
}

export async function removeAvatar(storageKey: string | null): Promise<void> {
  if (storageKey !== null) await mediaStorage.remove(storageKey);
}

export async function openAvatar(
  storageKey: string | null,
): Promise<{ stream: ReadStream; size: number } | null> {
  if (storageKey === null) return null;
  return mediaStorage.open(storageKey);
}
