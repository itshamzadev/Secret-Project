import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  e2efeDeviceParamsSchema,
  e2efeDeviceRegistrationSchema,
  e2efePreKeysUpdateSchema,
  e2efeUserParamsSchema,
} from "./e2efe.validation.js";
import {
  getE2EFEPreKeyBundle,
  listE2EFEDevices,
  registerE2EFEDevice,
  revokeE2EFEDevice,
  updateE2EFEPreKeys,
} from "./e2efe.service.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handleRegister = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const device = await registerE2EFEDevice(
    requireAuthContext(request),
    e2efeDeviceRegistrationSchema.parse(request.body),
  );
  response.status(201).json({ success: true, data: { device } });
};

const handleUpdatePreKeys = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { deviceId } = e2efeDeviceParamsSchema.parse(request.params);
  const device = await updateE2EFEPreKeys(
    requireAuthContext(request),
    deviceId,
    e2efePreKeysUpdateSchema.parse(request.body),
  );
  response.status(200).json({ success: true, data: { device } });
};

const handleListDevices = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { userId } = e2efeUserParamsSchema.parse(request.params);
  const devices = await listE2EFEDevices(requireAuthContext(request), userId);
  response.status(200).json({ success: true, data: { devices } });
};

const handleBundle = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { deviceId } = e2efeDeviceParamsSchema.parse(request.params);
  const bundle = await getE2EFEPreKeyBundle(
    requireAuthContext(request),
    deviceId,
  );
  response.status(200).json({ success: true, data: { bundle } });
};

const handleRevoke = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { deviceId } = e2efeDeviceParamsSchema.parse(request.params);
  const revoked = await revokeE2EFEDevice(
    requireAuthContext(request),
    deviceId,
  );
  response.status(200).json({ success: true, data: { revoked } });
};

export const registerE2EFEDeviceController: RequestHandler = controller(handleRegister);
export const updateE2EFEPreKeysController: RequestHandler = controller(handleUpdatePreKeys);
export const listE2EFEDevicesController: RequestHandler = controller(handleListDevices);
export const getE2EFEPreKeyBundleController: RequestHandler = controller(handleBundle);
export const revokeE2EFEDeviceController: RequestHandler = controller(handleRevoke);
