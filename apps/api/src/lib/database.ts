import mongoose from "mongoose";

import { env } from "../config/env.js";
import { logger } from "./logger.js";

export type ConnectionStatus = "connected" | "disconnected";

export async function connectDatabase(): Promise<void> {
  logger.info("Connecting to MongoDB");
  await mongoose.connect(env.MONGODB_URI);
  logger.info("MongoDB connection established");
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB connection closed");
  }
}

export function getDatabaseStatus(): ConnectionStatus {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}
