import test from "node:test";
import assert from "node:assert/strict";

import { routeFor } from "./routing.mjs";

const targets = {
  core: "core",
  calls: "calls",
  messages: "messages",
  media: "media",
  admin: "admin",
};

test("routes service boundaries without moving the current API", () => {
  assert.equal(routeFor("/api/v1/calls", targets), "calls");
  assert.equal(routeFor("/api/v1/conversations/abc/messages", targets), "messages");
  assert.equal(routeFor("/api/v1/media/file-key", targets), "media");
  assert.equal(routeFor("/api/v1/users/abc/avatar", targets), "media");
  assert.equal(routeFor("/api/v1/admin/users", targets), "admin");
  assert.equal(routeFor("/calls/socket.io/?EIO=4&transport=polling", targets), "calls");
  assert.equal(routeFor("/messages/socket.io/?EIO=4&transport=polling", targets), "messages");
  assert.equal(routeFor("/socket.io/?EIO=4&transport=polling", targets), "core");
  assert.equal(routeFor("/api/v1/auth/login", targets), "core");
});
