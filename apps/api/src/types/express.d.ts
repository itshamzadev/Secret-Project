import type { AuthContext } from "../modules/auth/auth.types.js";
import type { AdminAuthContext } from "../modules/admin/admin-user.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      admin?: AdminAuthContext;
    }
  }
}

export {};
