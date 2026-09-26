import mongoose from "mongoose";

import type { AuthServerConfig } from "./config.js";

export async function connectDatabase(config: AuthServerConfig): Promise<void> { await mongoose.connect(config.MONGODB_URI); }
export async function disconnectDatabase(): Promise<void> { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
export function getDatabaseStatus(): "connected" | "disconnected" { return mongoose.connection.readyState === 1 ? "connected" : "disconnected"; }
