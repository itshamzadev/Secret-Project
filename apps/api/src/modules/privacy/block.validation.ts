import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const blockUserParamsSchema = z.object({ userId: objectIdSchema });
