import { createServiceProxy } from "../shared/service-proxy.mjs";

createServiceProxy({ name: "mediaserver", portEnv: "MEDIASERVER_PORT", defaultPort: 5103 });
