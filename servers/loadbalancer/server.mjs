import http from "node:http";
import { proxyHttp, proxyUpgrade } from "../shared/service-proxy.mjs";
import { routeFor } from "./routing.mjs";

const core = process.env.CURRENT_API_URL ?? "http://127.0.0.1:5000";
const targets = {
  core,
  calls: process.env.CALLSERVER_URL ?? core,
  messages: process.env.MSGSSERVER_URL ?? core,
  media: process.env.MEDIASERVER_URL ?? core,
  admin: process.env.ADMINPANEL_URL ?? core,
};
const port = Number(process.env.LOADBALANCER_PORT ?? 8080);

const server = http.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service: "loadbalancer", status: "ok" }));
    return;
  }

  const pathname = new URL(request.url ?? "/", "http://edge.internal").pathname;
  proxyHttp(request, response, routeFor(pathname, targets));
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", "http://edge.internal").pathname;
  const target = pathname.startsWith("/calls/socket.io")
    ? targets.calls
    : pathname.startsWith("/messages/socket.io")
      ? targets.messages
      : targets.core;
  proxyUpgrade(request, socket, head, target);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Terqivo load balancer listening on ${port}`);
});
