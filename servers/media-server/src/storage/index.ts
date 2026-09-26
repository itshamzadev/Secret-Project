import { env } from "../config/env.js";
import { LocalMediaStorage, UnconfiguredMediaStorage } from "./local.storage.js";
import type { MediaStorage } from "./storage.interface.js";

export const mediaStorage: MediaStorage = env.MEDIA_STORAGE_DRIVER === "local"
  ? new LocalMediaStorage()
  : new UnconfiguredMediaStorage();

export async function initializeMediaStorage(): Promise<void> {
  await mediaStorage.initialize();
}
