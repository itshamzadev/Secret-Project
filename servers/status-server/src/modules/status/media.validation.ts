import { fileTypeFromBuffer } from "file-type";

import { AppError } from "../../core/errors.js";
import type { StatusType } from "../../models/status.types.js";

export interface InspectedMedia { mimeType: string; extension: string; isIsoBmff: boolean; hasAudioTrack: boolean; hasVideoTrack: boolean; }
export interface DetectedMedia { mimeType: string; extension: string; }

const allowedMimeTypes: Record<StatusType, readonly string[]> = {
  text: [],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/3gpp"],
};
const allowedAudioIntentMimeTypes = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/3gpp", "audio/x-m4a"]);

export async function inspectMedia(data: Buffer): Promise<InspectedMedia | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected === undefined ? null : { mimeType: detected.mime, extension: detected.ext, ...inspectIsoBmffTracks(data) };
}

export function validateDetectedMedia(type: Exclude<StatusType, "text">, inspected: InspectedMedia | null, intent: { declaredMimeType: string | null; fileName: string | null }): DetectedMedia {
  if (inspected === null) throw new AppError({ code: "MEDIA_TYPE_NOT_ALLOWED", message: "This file type is not supported.", statusCode: 415 });
  const mimeType = inspected.extension === "m4a" && inspected.mimeType === "audio/x-m4a" ? "audio/mp4" : inspected.mimeType;
  const knownAudioContainer = inspected.mimeType !== "audio/x-m4a" || (inspected.isIsoBmff && inspected.hasAudioTrack && !inspected.hasVideoTrack);
  const fileExtension = getFileExtension(intent.fileName);
  const genericAudioMp4 = type === "audio" && (inspected.mimeType === "video/mp4" || inspected.mimeType === "application/mp4") && inspected.isIsoBmff && inspected.hasAudioTrack && !inspected.hasVideoTrack && allowedAudioIntentMimeTypes.has(intent.declaredMimeType?.toLowerCase() ?? "") && ["m4a", "m4b"].includes(fileExtension ?? "");
  if ((!allowedMimeTypes[type].includes(mimeType) || !knownAudioContainer) && !genericAudioMp4) throw new AppError({ code: "MEDIA_TYPE_NOT_ALLOWED", message: "This file type is not supported.", statusCode: 415 });
  return { mimeType: genericAudioMp4 ? "audio/mp4" : mimeType, extension: genericAudioMp4 ? fileExtension ?? "m4a" : inspected.extension };
}

function getFileExtension(value: string | null): string | null { return value?.match(/\.([a-z\d]{1,8})$/i)?.[1]?.toLowerCase() ?? null; }

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
