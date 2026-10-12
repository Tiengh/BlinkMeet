import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeRateLimit } from "./rate-limit.store.js";

test("rate limit store hashes identities and returns the Redis counter state", async () => {
  const calls = [];
  const redis = {
    eval: async (script, options) => {
      calls.push({ script, options });
      return [3, 42_000];
    },
  };

  const result = await consumeRateLimit({
    scope: "http:auth:login",
    identity: "203.0.113.8",
    limit: 5,
    windowMs: 60_000,
    redis,
  });

  assert.deepEqual(result, {
    allowed: true,
    limit: 5,
    remaining: 2,
    retryAfterMs: 42_000,
  });
  assert.equal(calls[0].options.arguments[0], "60000");
  assert.equal(calls[0].options.keys[0].includes("203.0.113.8"), false);
});

test("rate limit store rejects a counter above the configured limit", async () => {
  const result = await consumeRateLimit({
    scope: "socket:event:chat:send",
    identity: "user-id",
    limit: 2,
    windowMs: 60_000,
    redis: { eval: async () => [3, 12_345] },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.retryAfterMs, 12_345);
});
