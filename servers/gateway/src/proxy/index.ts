export {
  createGatewayProxy,
  proxyHttpRequest,
  proxySocketUpgrade,
  sendProxyFailure,
  setGatewayRequestHeaders,
  type GatewayRequest,
  type ProxyFailure,
} from "./gateway-proxy.js";
export {
  gatewayRoutes,
  isSocketIoPath,
  routeForPath,
  routeTarget,
  socketIoRoute,
  type GatewayRoute,
} from "./route-map.js";
export type { HttpProxyServer } from "./gateway-proxy.js";
