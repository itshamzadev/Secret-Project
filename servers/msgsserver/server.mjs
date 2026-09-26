import { createServiceProxy } from "../shared/service-proxy.mjs";

createServiceProxy({ name: "msgsserver", portEnv: "MSGSSERVER_PORT", defaultPort: 5102 });
