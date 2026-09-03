import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAdminContext } from "../../middleware/authenticate-admin.js";
import {
  getAdminById,
  getAdminDashboard,
  listAdminUsers,
  loginAdmin,
} from "./admin.service.js";
import { toAdminUserDto } from "./admin.dto.js";
import { adminLoginSchema, adminUsersQuerySchema } from "./admin.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleLogin(
  request: Request,
  response: Response,
): Promise<void> {
  const result = await loginAdmin(adminLoginSchema.parse(request.body));
  response.status(200).json({ success: true, data: result });
}

async function handleMe(request: Request, response: Response): Promise<void> {
  const admin = await getAdminById(requireAdminContext(request).adminId);
  response.status(200).json({
    success: true,
    data: { admin: toAdminUserDto(admin) },
  });
}

async function handleLogout(
  _request: Request,
  response: Response,
): Promise<void> {
  response.status(200).json({ success: true, data: { loggedOut: true } });
}

async function handleDashboard(
  _request: Request,
  response: Response,
): Promise<void> {
  response.status(200).json({
    success: true,
    data: await getAdminDashboard(),
  });
}

async function handleUsers(
  request: Request,
  response: Response,
): Promise<void> {
  response.status(200).json({
    success: true,
    data: await listAdminUsers(adminUsersQuerySchema.parse(request.query)),
  });
}

export const adminLoginController: RequestHandler = controller(handleLogin);
export const adminMeController: RequestHandler = controller(handleMe);
export const adminLogoutController: RequestHandler = controller(handleLogout);
export const adminDashboardController: RequestHandler =
  controller(handleDashboard);
export const adminUsersController: RequestHandler = controller(handleUsers);
