import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.REDIS_KEY_PREFIX = `blinkmeet:test:presence:${process.pid}`;

const { connectRedis, getRedisClient } = await import(
  "../../infrastructure/redis/redis.client.js"
);
const {
  clearAllPresenceState,
  getPresenceStatus,
  removePresenceSocket,
  touchPresenceSocket,
} = await import("./presence.repository.js");

before(async () => {
  await connectRedis();
  await clearAllPresenceState();
});

after(async () => {
  await clearAllPresenceState();
  const redis = getRedisClient();
  if (redis.isOpen) {await redis.quit();}
});

test("presence stays online until the last active socket disconnects", async () => {
  assert.equal(await touchPresenceSocket("user-a", "socket-1"), true);
  assert.equal(await touchPresenceSocket("user-a", "socket-2"), false);
  assert.equal(await getPresenceStatus("user-a"), true);

  assert.equal(await removePresenceSocket("user-a", "socket-1"), false);
  assert.equal(await getPresenceStatus("user-a"), true);

  assert.equal(await removePresenceSocket("user-a", "socket-2"), true);
  assert.equal(await getPresenceStatus("user-a"), false);
});

test("refreshing an expired socket reports a new online transition", async () => {
  assert.equal(await touchPresenceSocket("user-b", "socket-1"), true);
  const redis = getRedisClient();
  const { redisKeys } = await import("../../infrastructure/redis/redis.keys.js");
  await redis.del(redisKeys.presence.socket("user-b", "socket-1"));

  assert.equal(await touchPresenceSocket("user-b", "socket-1"), true);
  assert.equal(await getPresenceStatus("user-b"), true);
});
