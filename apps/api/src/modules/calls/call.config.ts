import { z } from "zod";

import { env } from "../../config/env.js";

const iceServerSchema = z.object({
  urls: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1),
  ]),
  username: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
});

let parsedIceServers: unknown;
try {
  parsedIceServers = JSON.parse(env.ICE_SERVERS) as unknown;
} catch {
  throw new Error("Invalid ICE_SERVERS configuration: expected JSON.");
}

const parsed = z.array(iceServerSchema).min(1).safeParse(parsedIceServers);
if (!parsed.success) {
  throw new Error(
    "Invalid ICE_SERVERS configuration: expected ICE server objects.",
  );
}

export type IceServerConfig = z.infer<typeof iceServerSchema>;
export const iceServers: IceServerConfig[] = parsed.data;
