import { AppError } from "../core/errors.js";

export interface CursorValue { createdAt: string; id: string; }

export function encodeCursor(value: CursorValue): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }

export function decodeCursor(value: string | undefined): CursorValue | null {
  if (value === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { createdAt?: unknown }).createdAt !== "string" || typeof (parsed as { id?: unknown }).id !== "string") throw new Error("invalid cursor");
    return parsed as CursorValue;
  } catch {
    throw new AppError({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid.", statusCode: 400 });
  }
}
