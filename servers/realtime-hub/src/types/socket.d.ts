import type { AuthContext } from "../auth/socket-auth.js";

declare module "socket.io" {
  interface SocketData {
    auth?: AuthContext;
    accessToken?: string;
  }
}
