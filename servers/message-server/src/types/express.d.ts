import type { AuthContext } from "../modules/auth/auth.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}
