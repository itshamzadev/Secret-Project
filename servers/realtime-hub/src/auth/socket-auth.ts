import type { Socket } from "socket.io";

import { RealtimeError } from "../core/errors.js";
import { verifyAccessToken } from "./jwt.js";
import { getAuthenticatedUser } from "../clients/auth-server.client.js";

export interface AuthContext {
  userId: string;
  sessionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function accessTokenFromSocket(socket: Socket): string | null {
  const auth: unknown = socket.handshake.auth;
  if (isRecord(auth) && typeof auth.token === "string" && auth.token.length > 0) {
    return auth.token;
  }
  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization !== "string") return null;
  const parts = authorization.trim().split(/\s+/);
  return parts.length === 2 && parts[0]?.toLowerCase() === "bearer" ? parts[1] ?? null : null;
}

export async function authenticateSocket(socket: Socket): Promise<AuthContext> {
  const token = accessTokenFromSocket(socket);
  if (token === null) throw new RealtimeError("AUTHENTICATION_REQUIRED", "Socket authentication is required.", 401);
  const claims = await verifyAccessToken(token);
  await getAuthenticatedUser(token);
  return { userId: claims.sub, sessionId: claims.sid };
}

export function installSocketAuthentication(io: { use: (middleware: (socket: Socket, next: (error?: Error) => void) => void) => void }): void {
  io.use((socket, next) => {
    void authenticateSocket(socket)
      .then((context) => {
        socket.data.auth = context;
        const token = accessTokenFromSocket(socket);
        if (token !== null) socket.data.accessToken = token;
        next();
      })
      .catch((error: unknown) => {
        next(error instanceof Error ? error : new Error("Socket authentication failed"));
      });
  });
}
