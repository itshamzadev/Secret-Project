import type { Socket } from "socket.io";

const socketsBySessionId = new Map<string, Set<Socket>>();

export function registerSessionSocket(sessionId: string, socket: Socket): void {
  const sockets = socketsBySessionId.get(sessionId) ?? new Set<Socket>();
  sockets.add(socket);
  socketsBySessionId.set(sessionId, sockets);
}

export function unregisterSessionSocket(
  sessionId: string,
  socket: Socket,
): void {
  const sockets = socketsBySessionId.get(sessionId);
  if (sockets === undefined) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    socketsBySessionId.delete(sessionId);
  }
}

export function disconnectSessionSockets(sessionId: string): void {
  const sockets = socketsBySessionId.get(sessionId);
  if (sockets === undefined) {
    return;
  }

  for (const socket of sockets) {
    socket.disconnect(true);
  }
}

export function hasSessionSockets(sessionId: string): boolean {
  return (socketsBySessionId.get(sessionId)?.size ?? 0) > 0;
}
