import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  registerPushDevice,
  removePushDevice,
} from "./notification.service.js";
import {
  registerPushDeviceSchema,
  removePushDeviceSchema,
} from "./notification.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

async function handleRegister(
  request: Request,
  response: Response,
): Promise<void> {
  const device = await registerPushDevice(
    requireAuthContext(request),
    registerPushDeviceSchema.parse(request.body),
  );
  response.status(200).json({ success: true, data: { device } });
}

async function handleRemove(
  request: Request,
  response: Response,
): Promise<void> {
  const { pushToken } = removePushDeviceSchema.parse(request.body);
  const removed = await removePushDevice(
    requireAuthContext(request),
    pushToken,
  );
  response.status(200).json({ success: true, data: { removed } });
}

export const registerPushDeviceController: RequestHandler =
  controller(handleRegister);
export const removePushDeviceController: RequestHandler =
  controller(handleRemove);
