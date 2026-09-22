import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.REDIS_KEY_PREFIX = `blinkmeet:test:presence:${process.pid}`;

const { connectRedis, getRedisClient } = await import(
  "../../infrastructure/redis/redis.client.js"
);
const {
  clearAllPresenceState,
  getPresenceState,
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
  assert.deepEqual(await touchPresenceSocket("user-a", "socket-1"), {
    becameOnline: true,
    version: 1,
  });
  assert.deepEqual(await touchPresenceSocket("user-a", "socket-2"), {
    becameOnline: false,
    version: 1,
  });
  assert.equal(await getPresenceStatus("user-a"), true);

  assert.deepEqual(await removePresenceSocket("user-a", "socket-1"), {
    becameOffline: false,
    version: 1,
  });
  assert.equal(await getPresenceStatus("user-a"), true);

  assert.deepEqual(await removePresenceSocket("user-a", "socket-2"), {
    becameOffline: true,
    version: 2,
  });
  assert.equal(await getPresenceStatus("user-a"), false);
  assert.deepEqual(await removePresenceSocket("user-a", "socket-2"), {
    becameOffline: false,
    version: 2,
  });
});

test("expiration and reconnect advance the presence version monotonically", async () => {
  assert.deepEqual(await touchPresenceSocket("user-b", "socket-1"), {
    becameOnline: true,
    version: 1,
  });
  const redis = getRedisClient();
  const { redisKeys } = await import("../../infrastructure/redis/redis.keys.js");
  await redis.del(redisKeys.presence.socket("user-b", "socket-1"));

  assert.deepEqual(await getPresenceState("user-b"), {
    isOnline: false,
    version: 2,
    transitionedOffline: true,
  });
  assert.deepEqual(await getPresenceState("user-b"), {
    isOnline: false,
    version: 2,
    transitionedOffline: false,
  });
  assert.deepEqual(await touchPresenceSocket("user-b", "socket-1"), {
    becameOnline: true,
    version: 3,
  });
});
