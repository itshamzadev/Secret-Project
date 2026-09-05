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
}

export async function inspectMedia(
  data: Buffer,
): Promise<InspectedMedia | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected === undefined
    ? null
    : { mimeType: detected.mime, extension: detected.ext };
}

export async function detectMedia(
  type: MediaUploadQuery["type"],
  data: Buffer,
): Promise<DetectedMedia> {
  const inspected = await inspectMedia(data);
  return validateDetectedMedia(type, inspected);
}

export function validateDetectedMedia(
  type: MediaUploadQuery["type"],
  inspected: InspectedMedia | null,
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
  if (!allowedMimeTypes[type].includes(mimeType)) {
    throw new AppError({
      code: "MEDIA_TYPE_NOT_ALLOWED",
      message: "This file type is not supported.",
      statusCode: 415,
    });
  }
  return { mimeType, extension: inspected.extension };
}

export function sanitizeFileName(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .trim()
    .slice(0, 160);
  return normalized.length > 0 ? normalized : null;
}
