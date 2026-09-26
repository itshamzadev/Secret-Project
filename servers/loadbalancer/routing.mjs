const startsWithAny = (pathname, prefixes) => prefixes.some((prefix) => pathname.startsWith(prefix));

export function routeFor(pathname, targets) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return targets.admin;
  if (startsWithAny(pathname, ["/api/v1/admin"])) return targets.admin;
  if (startsWithAny(pathname, ["/calls/socket.io"])) return targets.calls;
  if (startsWithAny(pathname, ["/messages/socket.io"])) return targets.messages;

  if (startsWithAny(pathname, ["/api/v1/media"]) || /\/media(?:\/|$)/.test(pathname) || /\/avatar(?:\/|$)/.test(pathname)) {
    return targets.media;
  }
  if (startsWithAny(pathname, ["/api/v1/calls"])) return targets.calls;
  if (startsWithAny(pathname, ["/api/v1/conversations", "/api/v1/messages"])) return targets.messages;

  // Keep the legacy shared Socket.IO path on the core API for rollback. New
  // clients use the dedicated calls/messages paths above.
  return targets.core;
}
