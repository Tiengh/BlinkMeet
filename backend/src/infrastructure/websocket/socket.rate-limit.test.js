import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSocketConnectionRateLimitMiddleware,
  createSocketEventRateLimitMiddleware,
  createSocketIpConnectionRateLimitMiddleware,
} from "./socket.rate-limit.js";

test("socket IP connection limiter runs before authentication identity exists", async () => {
  const calls = [];
  const middleware = createSocketIpConnectionRateLimitMiddleware({
    policy: { limit: 10, windowMs: 60_000 },
    consume: async (input) => {
      calls.push(input);
      return { allowed: true, retryAfterMs: 60_000 };
    },
  });
  const error = await new Promise((resolve) => {
    middleware({
      data: {},
      handshake: { address: "203.0.113.8" },
    }, resolve);
  });

  assert.equal(error, undefined);
  assert.equal(calls[0].identity, "203.0.113.8");
  assert.equal(calls[0].scope, "socket:connection:ip");
});

test("socket connection limiter uses authenticated user identity", async () => {
  const calls = [];
  const middleware = createSocketConnectionRateLimitMiddleware({
    policy: { limit: 2, windowMs: 60_000 },
    consume: async (input) => {
      calls.push(input);
      return { allowed: true, retryAfterMs: 60_000 };
    },
  });
  const error = await new Promise((resolve) => {
    middleware({ data: { userId: "user-a" } }, resolve);
  });

  assert.equal(error, undefined);
  assert.equal(calls[0].identity, "user-a");
  assert.equal(calls[0].scope, "socket:connection");
});

test("socket event limiter rejects excess traffic through acknowledgement", async () => {
  const emitted = [];
  const socket = {
    data: { userId: "user-a" },
    emit: (...args) => emitted.push(args),
  };
  const middleware = createSocketEventRateLimitMiddleware(socket, {
    policies: { "chat:send": { limit: 1, windowMs: 60_000 } },
    consume: async () => ({ allowed: false, retryAfterMs: 7_500 }),
  });
  let nextCalls = 0;
  const response = await new Promise((resolve) => {
    middleware(["chat:send", { content: "hello" }, resolve], () => {
      nextCalls += 1;
    });
  });

  assert.equal(nextCalls, 0);
  assert.equal(response.code, "RATE_LIMITED");
  assert.equal(response.retryAfterMs, 7_500);
  assert.deepEqual(emitted, []);
});
