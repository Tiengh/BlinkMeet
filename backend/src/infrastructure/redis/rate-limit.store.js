import { createHash } from "node:crypto";
import { getRedisClient } from "./redis.client.js";
import { redisKeys } from "./redis.keys.js";

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

const identityDigest = (identity) => createHash("sha256")
  .update(String(identity))
  .digest("hex");

export const consumeRateLimit = async ({
  scope,
  identity,
  limit,
  windowMs,
  redis = getRedisClient(),
}) => {
  if (!scope || !identity || !Number.isInteger(limit) || !Number.isInteger(windowMs)) {
    throw new Error("Invalid rate limit configuration");
  }

  const [count, ttl] = await redis.eval(consumeScript, {
    keys: [redisKeys.rateLimit(scope, identityDigest(identity))],
    arguments: [String(windowMs)],
  });
  const normalizedCount = Number(count);
  const normalizedTtl = Math.max(0, Number(ttl));

  return {
    allowed: normalizedCount <= limit,
    limit,
    remaining: Math.max(0, limit - normalizedCount),
    retryAfterMs: normalizedTtl,
  };
};
