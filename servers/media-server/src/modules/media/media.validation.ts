import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

import { AppError } from "../../core/errors.js";

export const mediaUploadQuerySchema = z.object({
  clientMessageId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  type: z.enum(["image", "video", "audio", "file"]),
  width: z.coerce.number().int().min(1).max(20_000).optional(),
  height: z.coerce.number().int().min(1).max(20_000).optional(),
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
});

export const encryptedMediaUploadQuerySchema = z.object({
  clientMessageId: mediaUploadQuerySchema.shape.clientMessageId,
  type: mediaUploadQuerySchema.shape.type,
});

export type MediaUploadQuery = z.infer<typeof mediaUploadQuerySchema>;
export type MediaType = MediaUploadQuery["type"];

export interface InspectedMedia {
  mimeType: string;
  extension: string;
  isIsoBmff: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
}

export interface DetectedMedia { mimeType: string; extension: string; }

const allowedMimeTypes: Record<MediaType, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/3gpp"],
  file: ["application/pdf", "application/zip", "application/gzip", "text/plain"],
};

export async function inspectMedia(data: Buffer): Promise<InspectedMedia | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected === undefined ? null : { mimeType: detected.mime, extension: detected.ext, ...inspectIsoBmffTracks(data) };
}

export async function detectMedia(type: MediaType, data: Buffer, intent?: { declaredMimeType: string | null; fileName: string | null }): Promise<DetectedMedia> {
  return validateDetectedMedia(type, await inspectMedia(data), intent);
}

export function validateDetectedMedia(type: MediaType, inspected: InspectedMedia | null, intent?: { declaredMimeType: string | null; fileName: string | null }): DetectedMedia {
  if (inspected === null) throw new AppError({ code: "MEDIA_TYPE_NOT_ALLOWED", message: "This file type is not supported.", statusCode: 415 });
  const mimeType = inspected.extension === "m4a" && inspected.mimeType === "audio/x-m4a" ? "audio/mp4" : inspected.mimeType;
  const knownAudioContainer = inspected.mimeType !== "audio/x-m4a" || (inspected.isIsoBmff && inspected.hasAudioTrack && !inspected.hasVideoTrack);
  const genericAudioMp4 = type === "audio" && (inspected.mimeType === "video/mp4" || inspected.mimeType === "application/mp4") && inspected.isIsoBmff && inspected.hasAudioTrack && !inspected.hasVideoTrack && intent !== undefined && allowedAudioIntentMimeTypes.has(intent.declaredMimeType?.toLowerCase() ?? "") && ["m4a", "m4b"].includes(getFileExtension(intent.fileName) ?? "");
  if ((!allowedMimeTypes[type].includes(mimeType) || !knownAudioContainer) && !genericAudioMp4) throw new AppError({ code: "MEDIA_TYPE_NOT_ALLOWED", message: "This file type is not supported.", statusCode: 415 });
  return { mimeType: genericAudioMp4 ? "audio/mp4" : mimeType, extension: genericAudioMp4 ? getFileExtension(intent?.fileName) ?? "m4a" : inspected.extension };
}

const allowedAudioIntentMimeTypes = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/3gpp", "audio/x-m4a"]);

export function sanitizeFileName(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.replace(/[^A-Za-z0-9._ -]/g, "").trim().slice(0, 160);
  return normalized.length > 0 ? normalized : null;
}

function getFileExtension(value: string | null | undefined): string | null {
  return value?.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toLowerCase() ?? null;
}

function inspectIsoBmffTracks(data: Buffer): Pick<InspectedMedia, "isIsoBmff" | "hasAudioTrack" | "hasVideoTrack"> {
  const isIsoBmff = data.length >= 12 && data.readUInt32BE(0) >= 12 && data.toString("ascii", 4, 8) === "ftyp";
  if (!isIsoBmff) return { isIsoBmff: false, hasAudioTrack: false, hasVideoTrack: false };
  const tracks = { audio: false, video: false };
  scanBmffBoxes(data, 0, data.length, tracks, 0);
  return { isIsoBmff: true, hasAudioTrack: tracks.audio, hasVideoTrack: tracks.video };
}

function scanBmffBoxes(data: Buffer, start: number, end: number, tracks: { audio: boolean; video: boolean }, depth: number): void {
  if (depth > 8) return;
  let offset = start;
  while (offset + 8 <= end) {
    const size = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    let boxEnd: number;
    if (size === 1) { if (offset + 16 > end) return; const largeSize = data.readBigUInt64BE(offset + 8); if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return; boxEnd = offset + Number(largeSize); headerSize = 16; }
    else if (size === 0) boxEnd = end;
    else boxEnd = offset + size;
    if (boxEnd <= offset || boxEnd > end) return;
    if (type === "hdlr" && offset + 20 <= boxEnd) { const handler = data.toString("ascii", offset + 16, offset + 20); if (handler === "soun") tracks.audio = true; if (handler === "vide") tracks.video = true; }
    if (bmffContainerTypes.has(type)) { const childStart = type === "meta" ? offset + headerSize + 4 : offset + headerSize; if (childStart < boxEnd) scanBmffBoxes(data, childStart, boxEnd, tracks, depth + 1); }
    offset = boxEnd;
  }
}

const bmffContainerTypes = new Set(["dinf", "edts", "ipro", "mfra", "meta", "mdia", "minf", "moof", "moov", "mvex", "stbl", "trak", "traf"]);
