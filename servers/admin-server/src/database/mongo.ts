import mongoose from "mongoose";

import type { AdminServerConfig } from "../config/env.js";

export async function connectDatabase(config: AdminServerConfig): Promise<void> {
  await mongoose.connect(config.MONGODB_URI);
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function getDatabaseStatus(): "connected" | "disconnected" {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
