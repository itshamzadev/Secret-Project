import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";

import { AppError } from "../../core/errors.js";

const allowedMimeTypes: Record<
  "image" | "video" | "audio" | "file",
  readonly string[]
> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: [
    "audio/aac",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/3gpp",
  ],
  file: [
    "application/pdf",
    "application/zip",
    "application/gzip",
    "text/plain",
  ],
};

export const mediaUploadQuerySchema = z.object({
  clientMessageId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  type: z.enum(["image", "video", "audio", "file"]),
  width: z.coerce.number().int().min(1).max(20_000).optional(),
  height: z.coerce.number().int().min(1).max(20_000).optional(),
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
});

export type MediaUploadQuery = z.infer<typeof mediaUploadQuerySchema>;

export interface DetectedMedia {
  mimeType: string;
  extension: string;
}

export interface InspectedMedia {
  mimeType: string;
  extension: string;
  isIsoBmff: boolean;
  hasAudioTrack: boolean;
  hasVideoTrack: boolean;
}

export async function inspectMedia(
  data: Buffer,
): Promise<InspectedMedia | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected === undefined
    ? null
    : {
        mimeType: detected.mime,
        extension: detected.ext,
        ...inspectIsoBmffTracks(data),
      };
}

export interface MediaUploadIntent {
  declaredMimeType: string | null;
  fileName: string | null;
}

export async function detectMedia(
  type: MediaUploadQuery["type"],
  data: Buffer,
  intent?: MediaUploadIntent,
): Promise<DetectedMedia> {
  const inspected = await inspectMedia(data);
  return validateDetectedMedia(type, inspected, intent);
}

export function validateDetectedMedia(
  type: MediaUploadQuery["type"],
  inspected: InspectedMedia | null,
  intent?: MediaUploadIntent,
): DetectedMedia {
  if (inspected === null) {
    throw new AppError({
      code: "MEDIA_TYPE_NOT_ALLOWED",
      message: "This file type is not supported.",
      statusCode: 415,
    });
  }

  // Android's Expo high-quality recorder writes an ISO BMFF M4A file. The
  // file-type package identifies its M4A brand as audio/x-m4a, while the
  // recorder declares audio/mp4. This is still a signature-derived value;
  // the client extension or Content-Type is never used to authorize it.
  const mimeType =
    inspected.extension === "m4a" && inspected.mimeType === "audio/x-m4a"
      ? "audio/mp4"
      : inspected.mimeType;
  const isKnownAudioContainer =
    inspected.mimeType !== "audio/x-m4a" ||
    (inspected.isIsoBmff &&
      inspected.hasAudioTrack &&
      !inspected.hasVideoTrack);
  const isGenericAudioMp4 =
    type === "audio" &&
    (inspected.mimeType === "video/mp4" ||
      inspected.mimeType === "application/mp4") &&
    inspected.isIsoBmff &&
    inspected.hasAudioTrack &&
    !inspected.hasVideoTrack &&
    intent !== undefined &&
    isAllowedAudioMimeType(intent.declaredMimeType) &&
    isAudioMp4FileName(intent.fileName);
  if (
    (!allowedMimeTypes[type].includes(mimeType) || !isKnownAudioContainer) &&
    !isGenericAudioMp4
  ) {
    throw new AppError({
      code: "MEDIA_TYPE_NOT_ALLOWED",
      message: "This file type is not supported.",
      statusCode: 415,
    });
  }
  return {
    mimeType: isGenericAudioMp4 ? "audio/mp4" : mimeType,
    extension: isGenericAudioMp4
      ? getAudioMp4Extension(intent?.fileName)
      : inspected.extension,
  };
}

const allowedAudioIntentMimeTypes = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/3gpp",
  "audio/x-m4a",
]);

function isAllowedAudioMimeType(value: string | null): boolean {
  return value !== null && allowedAudioIntentMimeTypes.has(value.toLowerCase());
}

function isAudioMp4FileName(value: string | null): boolean {
  const extension = getFileExtension(value);
  return extension === "m4a" || extension === "m4b";
}

function getAudioMp4Extension(value: string | null | undefined): string {
  return getFileExtension(value ?? null) ?? "m4a";
}

function getFileExtension(value: string | null): string | null {
  const extension = value?.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toLowerCase();
  return extension ?? null;
}

function inspectIsoBmffTracks(
  data: Buffer,
): Pick<InspectedMedia, "isIsoBmff" | "hasAudioTrack" | "hasVideoTrack"> {
  const isIsoBmff = isFtypBox(data);
  if (!isIsoBmff) {
    return { isIsoBmff: false, hasAudioTrack: false, hasVideoTrack: false };
  }
  const tracks = { audio: false, video: false };
  scanBmffBoxes(data, 0, data.length, tracks, 0);
  return {
    isIsoBmff: true,
    hasAudioTrack: tracks.audio,
    hasVideoTrack: tracks.video,
  };
}

function isFtypBox(data: Buffer): boolean {
  return (
    data.length >= 12 &&
    data.readUInt32BE(0) >= 12 &&
    data.toString("ascii", 4, 8) === "ftyp"
  );
}

function scanBmffBoxes(
  data: Buffer,
  start: number,
  end: number,
  tracks: { audio: boolean; video: boolean },
  depth: number,
): void {
  if (depth > 8) return;
  let offset = start;
  while (offset + 8 <= end) {
    const size = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    let boxEnd: number;
    if (size === 1) {
      if (offset + 16 > end) return;
      const largeSize = data.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return;
      boxEnd = offset + Number(largeSize);
      headerSize = 16;
    } else if (size === 0) {
      boxEnd = end;
    } else {
      boxEnd = offset + size;
    }
    if (boxEnd <= offset || boxEnd > end) return;

    if (type === "hdlr" && offset + 20 <= boxEnd) {
      const handlerType = data.toString("ascii", offset + 16, offset + 20);
      if (handlerType === "soun") tracks.audio = true;
      if (handlerType === "vide") tracks.video = true;
    }

    if (bmffContainerTypes.has(type)) {
      const childStart =
        type === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart < boxEnd)
        scanBmffBoxes(data, childStart, boxEnd, tracks, depth + 1);
    }
    offset = boxEnd;
  }
}

const bmffContainerTypes = new Set([
  "dinf",
  "edts",
  "ipro",
  "mfra",
  "meta",
  "mdia",
  "minf",
  "moof",
  "moov",
  "mvex",
  "stbl",
  "trak",
  "traf",
]);

export function sanitizeFileName(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .trim()
    .slice(0, 160);
  return normalized.length > 0 ? normalized : null;
}
