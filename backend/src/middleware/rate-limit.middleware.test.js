import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimitMiddleware } from "./rate-limit.middleware.js";

const createResponse = () => {
  const headers = {};
  return {
    headers,
    statusCode: null,
    body: null,
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
};

test("HTTP rate limiter continues and publishes remaining quota", async () => {
  const res = createResponse();
  let nextCalls = 0;
  const middleware = createRateLimitMiddleware({
    scope: "test",
    limit: 5,
    windowMs: 60_000,
    consume: async () => ({
      allowed: true,
      limit: 5,
      remaining: 4,
      retryAfterMs: 59_000,
    }),
  });

  await middleware({ ip: "127.0.0.1" }, res, () => {nextCalls += 1;});

  assert.equal(nextCalls, 1);
  assert.equal(res.headers["RateLimit-Remaining"], "4");
  assert.equal(res.statusCode, null);
});

test("HTTP rate limiter returns 429 and Retry-After when quota is exhausted", async () => {
  const res = createResponse();
  let nextCalls = 0;
  const middleware = createRateLimitMiddleware({
    scope: "test",
    limit: 1,
    windowMs: 60_000,
    consume: async () => ({
      allowed: false,
      limit: 1,
      remaining: 0,
      retryAfterMs: 2_100,
    }),
  });

  await middleware({ ip: "127.0.0.1" }, res, () => {nextCalls += 1;});

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "3");
  assert.equal(res.body.code, "RATE_LIMITED");
});
