import { AppError } from "../core/errors.js";
import { isRecord } from "./mongo.js";

export interface CursorValue {
  createdAt: string;
  id: string;
}

export function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor(value: string | undefined): CursorValue | null {
  if (value === undefined) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      !isRecord(parsed) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new AppError({
      code: "INVALID_CURSOR",
      message: "The pagination cursor is invalid.",
      statusCode: 400,
    });
  }
}
