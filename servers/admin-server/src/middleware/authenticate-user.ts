import type { RequestHandler } from "express";

import type { AdminServerConfig } from "../config/env.js";
import { authenticateUserToken } from "../auth/user-jwt.js";

export function createUserAuthentication(config: AdminServerConfig): RequestHandler {
  return (request, _response, next) => {
    void authenticateUserToken(config, request.get("authorization"))
      .then((context) => { request.adminUser = context; next(); })
      .catch(next);
  };
}
