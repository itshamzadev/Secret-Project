import { jwtVerify } from "jose";

import { env } from "../config/env.js";

const mediaServiceNames = ["media-server"] as const;

export async function verifyInternalServiceToken(value: string | undefined): Promise<boolean> {
  if (value === undefined || env.INTERNAL_SERVICE_SECRET === undefined) return false;
  try {
    const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
      algorithms: ["HS256"],
      issuer: env.INTERNAL_SERVICE_ISSUER,
      audience: env.INTERNAL_SERVICE_AUDIENCE,
      clockTolerance: 5,
    });
    return result.payload.serviceName === "realtime-hub";
  } catch {
    return false;
  }
}

export function internalServiceGuard(request: { get(name: string): string | undefined }, response: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  void verifyInternalServiceToken(request.get("x-internal-service-token")).then((valid) => {
    if (!valid) {
      response.status(401).json({ success: false, error: { code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required." } });
      return;
    }
    next();
  });
}

export function mediaInternalServiceGuard(request: { get(name: string): string | undefined }, response: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  void verifyJwtServiceToken(request.get("x-internal-service-token"), mediaServiceNames).then((valid) => {
    if (!valid) { response.status(401).json({ success: false, error: { code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required." } }); return; }
    next();
  });
}

export function adminInternalServiceGuard(request: { get(name: string): string | undefined }, response: { status(code: number): { json(body: unknown): void } }, next: () => void): void {
  void verifyJwtServiceToken(request.get("x-internal-service-token"), ["admin-server"]).then((valid) => {
    if (!valid) { response.status(401).json({ success: false, error: { code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required." } }); return; }
    next();
  });
}

async function verifyJwtServiceToken(value: string | undefined, services: readonly string[]): Promise<boolean> {
  if (value === undefined || env.INTERNAL_SERVICE_SECRET === undefined) return false;
  try {
    const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), { algorithms: ["HS256"], issuer: env.INTERNAL_SERVICE_ISSUER, audience: env.INTERNAL_SERVICE_AUDIENCE, clockTolerance: 5 });
    return typeof result.payload.serviceName === "string" && services.includes(result.payload.serviceName);
  } catch { return false; }
}
