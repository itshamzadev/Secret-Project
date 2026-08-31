import type { AuthContext } from "../modules/auth/auth.types.js";

declare module "socket.io" {
  interface SocketData {
    auth?: AuthContext;
  }
}
