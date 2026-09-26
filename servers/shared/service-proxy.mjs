import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { URL } from "node:url";

const supportedProtocols = new Map([
  ["http:", http],
  ["https:", https],
]);

function parseTarget(rawTarget) {
  const target = new URL(rawTarget);
  if (!supportedProtocols.has(target.protocol)) {
    throw new Error(`Unsupported upstream protocol: ${target.protocol}`);
  }
  return target;
}

function forwardedHeaders(request, target) {
  const headers = { ...request.headers };
  headers.host = target.host;
  headers["x-forwarded-host"] = request.headers.host ?? "";
  headers["x-forwarded-proto"] = request.socket.encrypted ? "https" : "http";
  headers["x-forwarded-for"] = request.socket.remoteAddress ?? "";
  return headers;
}

function sendProxyError(response, error) {
  if (response.headersSent) {
    response.destroy(error);
    return;
  }

  response.writeHead(502, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "UPSTREAM_UNAVAILABLE" }));
}

export function proxyHttp(request, response, rawTarget) {
  let target;
  try {
    target = parseTarget(rawTarget);
  } catch (error) {
    sendProxyError(response, error);
    return;
  }

  const transport = supportedProtocols.get(target.protocol);
  const upstream = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: request.method,
    path: new URL(request.url ?? "/", target).pathname + new URL(request.url ?? "/", target).search,
    headers: forwardedHeaders(request, target),
  });

  upstream.once("response", (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.once("error", (error) => sendProxyError(response, error));
  request.once("aborted", () => upstream.destroy());
  request.pipe(upstream);
}

function writeUpgradeRequest(request, socket, target) {
  const requestUrl = new URL(request.url ?? "/", target);
  const headers = forwardedHeaders(request, target);
  const lines = [`${request.method ?? "GET"} ${requestUrl.pathname}${requestUrl.search} HTTP/1.1`];
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${name}: ${item}`);
    } else if (value !== undefined) {
      lines.push(`${name}: ${value}`);
    }
  }
  lines.push("", "");
  socket.write(lines.join("\r\n"));
}

export function proxyUpgrade(request, clientSocket, head, rawTarget) {
  let target;
  try {
    target = parseTarget(rawTarget);
  } catch {
    clientSocket.destroy();
    return;
  }

  const connectOptions = {
    host: target.hostname,
    port: Number(target.port || (target.protocol === "https:" ? 443 : 80)),
  };
  const isTls = target.protocol === "https:";
  const upstreamSocket = isTls
    ? tls.connect({ ...connectOptions, servername: target.hostname })
    : net.connect(connectOptions);

  const closeBoth = () => {
    clientSocket.destroy();
    upstreamSocket.destroy();
  };
  const onConnected = () => {
    writeUpgradeRequest(request, upstreamSocket, target);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  };
  upstreamSocket.once(isTls ? "secureConnect" : "connect", onConnected);
  upstreamSocket.once("error", closeBoth);
  clientSocket.once("error", closeBoth);
}

export function createServiceProxy({ name, portEnv, defaultPort, upstreamEnv = "CURRENT_API_URL" }) {
  const port = Number(process.env[portEnv] ?? defaultPort);
  const upstream = process.env[upstreamEnv] ?? process.env.CURRENT_API_URL ?? "http://127.0.0.1:5000";
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ service: name, status: "ok", mode: "compatibility-proxy" }));
      return;
    }
    proxyHttp(request, response, upstream);
  });

  server.on("upgrade", (request, socket, head) => {
    proxyUpgrade(request, socket, head, upstream);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`${name} compatibility proxy listening on ${port}`);
  });
  return server;
}
