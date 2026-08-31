import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from "./auth.cookies.js";
import {
  createDeviceMetadata,
  getCurrentUser,
  listActiveSessions,
  loginUser,
  refreshUserSession,
  registerUser,
  revokeAllSessions,
  revokeCurrentSession,
  revokeOwnedSession,
} from "./auth.service.js";
import { toSafeUserDto } from "../users/user.dto.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  sessionIdParamsSchema,
} from "./auth.validation.js";

function sendAuthResponse(
  response: Response,
  result: Awaited<ReturnType<typeof registerUser>>,
  statusCode: number,
): void {
  setRefreshTokenCookie(
    response,
    result.refreshToken,
    new Date(result.session.expiresAt),
  );
  response.status(statusCode).json({ success: true, data: result });
}

async function handleRegister(
  request: Request,
  response: Response,
): Promise<void> {
  const input = registerSchema.parse(request.body);
  const device = createDeviceMetadata(
    input,
    request.get("user-agent"),
    request.ip,
  );
  const result = await registerUser(input, device);
  sendAuthResponse(response, result, 201);
}

async function handleLogin(
  request: Request,
  response: Response,
): Promise<void> {
  const input = loginSchema.parse(request.body);
  const device = createDeviceMetadata(
    input,
    request.get("user-agent"),
    request.ip,
  );
  const result = await loginUser(input, device);
  sendAuthResponse(response, result, 200);
}

async function handleRefresh(
  request: Request,
  response: Response,
): Promise<void> {
  const input = refreshSchema.parse(request.body ?? {});
  const refreshToken =
    input.refreshToken ?? request.cookies?.[REFRESH_COOKIE_NAME];

  if (refreshToken === undefined) {
    response.status(401).json({
      success: false,
      error: {
        code: "INVALID_REFRESH_TOKEN",
        message: "The refresh token is invalid or expired.",
      },
    });
    return;
  }

  const result = await refreshUserSession(refreshToken);
  sendAuthResponse(response, result, 200);
}

async function handleLogout(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  await revokeCurrentSession(context);
  clearRefreshTokenCookie(response);
  response.status(200).json({ success: true, data: { loggedOut: true } });
}

async function handleLogoutAll(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const revokedCount = await revokeAllSessions(context);
  clearRefreshTokenCookie(response);
  response.status(200).json({
    success: true,
    data: { loggedOut: true, revokedCount },
  });
}

async function handleMe(request: Request, response: Response): Promise<void> {
  const context = requireAuthContext(request);
  const user = await getCurrentUser(context);
  response.status(200).json({
    success: true,
    data: { user: toSafeUserDto(user) },
  });
}

async function handleListSessions(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const sessions = await listActiveSessions(context);
  response.status(200).json({ success: true, data: { sessions } });
}

async function handleRevokeSession(
  request: Request,
  response: Response,
): Promise<void> {
  const context = requireAuthContext(request);
  const { sessionId } = sessionIdParamsSchema.parse(request.params);
  await revokeOwnedSession(context, sessionId);

  if (sessionId === context.sessionId) {
    clearRefreshTokenCookie(response);
  }

  response.status(200).json({ success: true, data: { revoked: true } });
}

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

export const registerController: RequestHandler = controller(handleRegister);
export const loginController: RequestHandler = controller(handleLogin);
export const refreshController: RequestHandler = controller(handleRefresh);
export const logoutController: RequestHandler = controller(handleLogout);
export const logoutAllController: RequestHandler = controller(handleLogoutAll);
export const meController: RequestHandler = controller(handleMe);
export const listSessionsController: RequestHandler =
  controller(handleListSessions);
export const revokeSessionController: RequestHandler =
  controller(handleRevokeSession);
