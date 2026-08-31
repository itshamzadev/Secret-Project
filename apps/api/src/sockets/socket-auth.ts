import type { Socket } from "socket.io";

import { getActiveSession } from "../modules/auth/auth.service.js";
import type { AuthContext } from "../modules/auth/auth.types.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { getUserById } from "../modules/users/user.service.js";
import { isRecord } from "../utils/mongo.js";

function accessTokenFromSocket(socket: Socket): string | null {
  const auth: unknown = socket.handshake.auth;
  if (
    isRecord(auth) &&
    typeof auth.token === "string" &&
    auth.token.length > 0
  ) {
    return auth.token;
  }

  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }
  const parts = authorization.trim().split(/\s+/);
  return parts.length === 2 && parts[0]?.toLowerCase() === "bearer"
    ? (parts[1] ?? null)
    : null;
}

export async function authenticateSocket(socket: Socket): Promise<AuthContext> {
  const token = accessTokenFromSocket(socket);
  if (token === null) {
    throw new Error("Socket authentication failed");
  }

  const claims = await verifyAccessToken(token);
  const [user, session] = await Promise.all([
    getUserById(claims.sub),
    getActiveSession(claims.sub, claims.sid),
  ]);
  if (user === null || session === null || user.accountStatus !== "active") {
    throw new Error("Socket authentication failed");
  }

  return { userId: claims.sub, sessionId: claims.sid };
}

export function installSocketAuthentication(socketServer: {
  use: (
    middleware: (socket: Socket, next: (error?: Error) => void) => void,
  ) => void;
}): void {
  socketServer.use((socket, next) => {
    void authenticateSocket(socket)
      .then((context) => {
        socket.data.auth = context;
        next();
      })
      .catch(() => next(new Error("Socket authentication failed")));
  });
}
