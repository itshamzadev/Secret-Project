import mongoose from "mongoose";

import type { StatusServerConfig } from "./config.js";

export async function connectDatabase(config: StatusServerConfig): Promise<void> { await mongoose.connect(config.MONGODB_URI); }
export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
export function getDatabaseStatus(): "connected" | "disconnected" { return mongoose.connection.readyState === 1 ? "connected" : "disconnected"; }
