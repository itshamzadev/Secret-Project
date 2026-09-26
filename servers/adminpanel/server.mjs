import { createServiceProxy } from "../shared/service-proxy.mjs";

createServiceProxy({ name: "adminpanel", portEnv: "ADMINPANEL_PORT", defaultPort: 5104 });
