import type { AuthContext } from "../clients/auth.client.js";

declare global {
  namespace Express { interface Request { auth?: AuthContext; requestId?: string; correlationId?: string; } }
}

export {};
