import { createServer } from "node:http";

import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "./lib/database.js";
import { ContactModel } from "./models/contact.model.js";
import { UserBlockModel } from "./models/block.model.js";
import { createRelationshipApp } from "./app.js";

export async function startRelationshipServer(): Promise<void> {
  await connectDatabase();
  await Promise.all([ContactModel.init(), UserBlockModel.init()]);
  const server = createServer(createRelationshipApp({ databaseStatus: getDatabaseStatus }));
  let stopping = false;
  const stop = async (): Promise<void> => { if (stopping) return; stopping = true; await new Promise<void>((resolve) => { if (!server.listening) { resolve(); return; } server.close(() => resolve()); }); await disconnectDatabase(); };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(env.PORT, "0.0.0.0", () => { server.removeListener("error", reject); resolve(); }); });
  console.info(`Terqivo Relationship Server listening on ${env.PORT}`);
}

if (env.NODE_ENV !== "test") void startRelationshipServer().catch(() => { process.exitCode = 1; });
