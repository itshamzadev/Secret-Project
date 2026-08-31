export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isMongoDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

export function getMongoDuplicateFields(error: unknown): string[] {
  if (!isRecord(error) || !isRecord(error.keyPattern)) {
    return [];
  }

  return Object.keys(error.keyPattern);
}
