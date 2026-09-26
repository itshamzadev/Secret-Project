import { jwtVerify } from "jose";

import { env } from "../config/env.js";

export async function requireRealtimeHubService(value: string | undefined): Promise<void> {
  if (value === undefined || value.trim() === "") throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
  const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
    issuer: env.INTERNAL_SERVICE_ISSUER,
    audience: env.INTERNAL_SERVICE_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: 5,
  });
  if (result.payload.serviceName !== "realtime-hub") throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
}
