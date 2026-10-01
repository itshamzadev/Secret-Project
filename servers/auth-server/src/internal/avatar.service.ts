import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { Response as ExpressResponse } from "express";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";

import type { AuthServerConfig } from "../config.js";
import { AppError } from "./auth-core/contracts.js";
import { UserModel } from "./auth-core/user.model.js";
import { toSafeUserDto } from "./auth-core/user.dto.js";
import { getPrivacySettings } from "./privacy.service.js";
import { issueServiceToken } from "./service-auth.js";

function mediaError(): AppError { return new AppError({ code: "MEDIA_SERVICE_UNAVAILABLE", message: "Media storage is temporarily unavailable.", statusCode: 503 }); }
async function mediaRequest(config: AuthServerConfig, path: string, init: RequestInit = {}): Promise<globalThis.Response> {
  const token = await issueServiceToken(config);
  try { const response = await fetch(`${config.MEDIA_SERVICE_URL}${path}`, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}), "x-internal-service-token": token }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`MEDIA_${response.status}`); return response; } catch { throw mediaError(); }
}

export async function uploadAvatar(config: AuthServerConfig, userId: string, data: Buffer): Promise<unknown> {
  if (data.length === 0) throw new AppError({ code: "AVATAR_BODY_REQUIRED", message: "An avatar image is required.", statusCode: 400 });
  const detected = await fileTypeFromBuffer(data);
  if (detected === undefined || !detected.mime.startsWith("image/")) throw new AppError({ code: "AVATAR_TYPE_NOT_ALLOWED", message: "Choose a valid image for the avatar.", statusCode: 415 });
  const user = await UserModel.findById(userId).exec();
  if (user === null) throw new AppError({ code: "USER_NOT_FOUND", message: "Your account was not found.", statusCode: 404 });
  const key = `${randomUUID()}.${detected.ext}`;
  await mediaRequest(config, `/internal/media/files/${encodeURIComponent(key)}`, { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": "application/octet-stream" } });
  const previous = user.avatarStorageKey;
  user.avatarStorageKey = key;
  user.avatarMimeType = detected.mime;
  user.avatarUrl = `/api/v1/users/${user._id.toString()}/avatar`;
  try { await user.save(); } catch (error) { await deleteAvatar(config, key).catch(() => undefined); throw error; }
  if (previous !== null) await deleteAvatar(config, previous).catch(() => undefined);
  return toSafeUserDto(user);
}

export async function deleteAvatar(config: AuthServerConfig, storageKey: string | null): Promise<void> {
  if (storageKey === null) return;
  await mediaRequest(config, `/internal/media/files/${encodeURIComponent(storageKey)}`, { method: "DELETE" });
}

export async function clearAvatar(config: AuthServerConfig, userId: string): Promise<unknown> {
  const user = await UserModel.findById(userId).exec();
  if (user === null) throw new AppError({ code: "USER_NOT_FOUND", message: "Your account was not found.", statusCode: 404 });
  const previous = user.avatarStorageKey;
  user.avatarStorageKey = null; user.avatarMimeType = null; user.avatarUrl = null;
  await user.save();
  await deleteAvatar(config, previous).catch(() => undefined);
  return toSafeUserDto(user);
}

export async function streamAvatar(config: AuthServerConfig, userId: string, viewerId: string, response: ExpressResponse): Promise<void> {
  const user = await UserModel.findOne({ _id: userId, accountStatus: "active" }).select({ avatarStorageKey: 1, avatarMimeType: 1 }).exec();
  if (user === null || user.avatarStorageKey === null) throw new AppError({ code: "AVATAR_NOT_FOUND", message: "The avatar was not found.", statusCode: 404 });
  if (viewerId !== userId) {
    const privacy = await getPrivacySettings(userId);
    let allowed = privacy.profilePhoto === "everyone";
    if (privacy.profilePhoto === "contacts") {
      const token = await issueServiceToken(config);
      const relationship = await fetch(`${config.RELATIONSHIP_SERVICE_URL}/internal/relationships/check`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-service-token": token }, body: JSON.stringify({ firstUserId: viewerId, secondUserId: userId }), signal: AbortSignal.timeout(5000) });
      const body: unknown = await relationship.json().catch(() => undefined);
      allowed = relationship.ok && typeof body === "object" && body !== null && "data" in body && typeof body.data === "object" && body.data !== null && "areContacts" in body.data && body.data.areContacts === true;
    }
    if (!allowed) throw new AppError({ code: "AVATAR_NOT_FOUND", message: "The avatar was not found.", statusCode: 404 });
  }
  const media = await mediaRequest(config, `/internal/media/files/${encodeURIComponent(user.avatarStorageKey)}`, { headers: { "x-media-mime-type": user.avatarMimeType ?? "image/jpeg" } });
  response.setHeader("Content-Type", user.avatarMimeType ?? "image/jpeg");
  response.setHeader("Content-Length", media.headers.get("content-length") ?? "0");
  response.setHeader("Cache-Control", "private, max-age=300");
  if (media.body !== null) await pipeline(Readable.fromWeb(media.body as ReadableStream), response);
}

export async function streamAdminAvatar(config: AuthServerConfig, userId: string, response: ExpressResponse): Promise<void> {
  const user = await UserModel.findById(userId).select({ avatarStorageKey: 1, avatarMimeType: 1 }).exec();
  if (user === null || user.avatarStorageKey === null) throw new AppError({ code: "AVATAR_NOT_FOUND", message: "The avatar was not found.", statusCode: 404 });
  const media = await mediaRequest(config, `/internal/media/files/${encodeURIComponent(user.avatarStorageKey)}`, { headers: { "x-media-mime-type": user.avatarMimeType ?? "image/jpeg" } });
  response.setHeader("Content-Type", user.avatarMimeType ?? "image/jpeg");
  response.setHeader("Content-Length", media.headers.get("content-length") ?? "0");
  response.setHeader("Cache-Control", "private, max-age=300");
  if (media.body !== null) await pipeline(Readable.fromWeb(media.body as ReadableStream), response);
}
