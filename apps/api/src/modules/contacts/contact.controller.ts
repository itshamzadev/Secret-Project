import type { NextFunction, Request, RequestHandler, Response } from "express";

import { requireAuthContext } from "../../middleware/authenticate.js";
import {
  addContact,
  listContacts,
  removeContact,
  updateContact,
} from "./contact.service.js";
import {
  contactIdentifierSchema,
  contactListQuerySchema,
  contactUpdateSchema,
  contactUserIdParamsSchema,
} from "./contact.validation.js";

function controller(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const handleAdd = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const result = await addContact(
    requireAuthContext(request),
    contactIdentifierSchema.parse(request.body),
  );
  response.status(201).json({ success: true, data: { contact: result } });
};

const handleList = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const result = await listContacts(
    requireAuthContext(request),
    contactListQuerySchema.parse(request.query),
  );
  response.status(200).json({ success: true, data: result });
};

const handleUpdate = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { contactUserId } = contactUserIdParamsSchema.parse(request.params);
  const result = await updateContact(
    requireAuthContext(request),
    contactUserId,
    contactUpdateSchema.parse(request.body),
  );
  response.status(200).json({ success: true, data: { contact: result } });
};

const handleRemove = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { contactUserId } = contactUserIdParamsSchema.parse(request.params);
  await removeContact(requireAuthContext(request), contactUserId);
  response.status(200).json({ success: true, data: { removed: true } });
};

export const addContactController: RequestHandler = controller(handleAdd);
export const listContactsController: RequestHandler = controller(handleList);
export const updateContactController: RequestHandler = controller(handleUpdate);
export const removeContactController: RequestHandler = controller(handleRemove);
