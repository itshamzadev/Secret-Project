import mongoose from "mongoose";

import { env } from "../config/env.js";

export async function connectDatabase(): Promise<void> { await mongoose.connect(env.MONGODB_URI); }
export async function disconnectDatabase(): Promise<void> { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
export function getDatabaseStatus(): "connected" | "disconnected" { return mongoose.connection.readyState === 1 ? "connected" : "disconnected"; }
