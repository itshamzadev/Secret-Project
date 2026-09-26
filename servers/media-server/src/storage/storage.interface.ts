import type { Readable } from "node:stream";

export interface MediaFile {
  stream: Readable;
  size: number;
  mimeType?: string;
}

export interface MediaStorage {
  initialize(): Promise<void>;
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  open(key: string, range?: { start: number; end: number }): Promise<MediaFile | null>;
  exists(key: string): Promise<boolean>;
}
