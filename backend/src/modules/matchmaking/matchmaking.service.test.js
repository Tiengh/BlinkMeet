import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, before, beforeEach, test } from "node:test";
import { promisify } from "node:util";

process.env.REDIS_KEY_PREFIX = `blinkmeet:test:${process.pid}`;
const { connectRedis, getRedisClient } = await import("../../infrastructure/redis/redis.client.js");
const { redisKeys } = await import("../../infrastructure/redis/redis.keys.js");
const repository = await import("./matchmaking.repository.js");
const { getStatus, leave, search } = await import("./matchmaking.service.js");
const execFileAsync = promisify(execFile);

before(connectRedis);
after(async () => {await getRedisClient().quit();});

beforeEach(repository.clearAllMatchmakingState);

test("repository exposes explicit waiting-user storage methods", () => {
  assert.equal(typeof repository.saveWaitingUser, "function");
  assert.equal(typeof repository.refreshWaitingUser, "function");
  assert.equal(typeof repository.getWaitingUsers, "function");
  assert.equal(typeof repository.tryCreateMatch, "function");
  assert.equal(typeof repository.clearAllMatchmakingState, "function");
});

test("first user waits when no candidate is available", async () => {
  const result = await search("user-a");

  assert.deepEqual(result, { status: "waiting" });
  assert.equal((await getStatus("user-a")).status, "waiting");
});

test("two waiting users match and share the same callId", async () => {
  await search("user-a");
  const result = await search("user-b");

  assert.equal(result.status, "matched");
  assert.ok(result.callId);
  assert.equal(result.peerId, "user-a");

  const matchForA = await getStatus("user-a");
  const matchForB = await getStatus("user-b");

  assert.equal(matchForA.status, "matched");
  assert.equal(matchForB.status, "matched");
  assert.equal(matchForA.callId, matchForB.callId);
  assert.equal(matchForA.peerId, "user-b");
  assert.equal(matchForB.peerId, "user-a");
});

test("a separate backend process shares the Redis matchmaking queue", async () => {
  await search("user-a");
  const script = `
    import { connectRedis, getRedisClient } from ${JSON.stringify(new URL("../../infrastructure/redis/redis.client.js", import.meta.url).href)};
    import { search } from ${JSON.stringify(new URL("./matchmaking.service.js", import.meta.url).href)};
    await connectRedis();
    console.log(JSON.stringify(await search("user-b")));
    await getRedisClient().quit();
  `;
  const { stdout } = await execFileAsync(process.execPath,
    ["--input-type=module", "-e", script], { env: process.env });

  const matchForB = JSON.parse(stdout.trim());
  const matchForA = await getStatus("user-a");
  assert.equal(matchForB.peerId, "user-a");
  assert.equal(matchForA.peerId, "user-b");
  assert.equal(matchForA.callId, matchForB.callId);
});

test("active users cannot be reused by a third user", async () => {
  await search("user-a");
  await search("user-b");

  const result = await search("user-c");

  assert.deepEqual(result, { status: "waiting" });
  assert.equal((await getStatus("user-c")).status, "waiting");
});

test("repeated searches keep a single waiting entry", async () => {
  const firstResult = await search("user-a");
  const secondResult = await search("user-a");
  const waitingUsers = await repository.getWaitingUsers();

  assert.deepEqual(firstResult, { status: "waiting" });
  assert.deepEqual(secondResult, { status: "waiting" });
  assert.equal(waitingUsers.length, 1);
  assert.equal(waitingUsers[0].userId, "user-a");
});

test("repeated search returns the existing match without corrupting it", async () => {
  await search("user-a");
  const originalMatch = await search("user-b");
  const repeatedMatch = await search("user-b");
  const peerMatch = await getStatus("user-a");

  assert.deepEqual(repeatedMatch, originalMatch);
  assert.equal(peerMatch.callId, originalMatch.callId);
  assert.equal(peerMatch.peerId, "user-b");
  assert.equal(await repository.getWaitingUser("user-b"), undefined);
});

test("concurrent repeated searches do not requeue a matched user", async () => {
  await search("user-a");

  await Promise.all([
    search("user-b"),
    search("user-a"),
    search("user-a"),
  ]);

  const matchA = await getStatus("user-a");
  const matchB = await getStatus("user-b");

  assert.equal(matchA.status, "matched");
  assert.equal(matchA.peerId, "user-b");
  assert.equal(matchB.peerId, "user-a");
  assert.equal(matchA.callId, matchB.callId);
  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.equal(await repository.getWaitingUser("user-b"), undefined);
});

test("a waiting user can leave and search again normally", async () => {
  await search("user-a");
  await leave("user-a");

  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.deepEqual(await getStatus("user-a"), { status: "idle" });

  await search("user-b");
  const result = await search("user-a");

  assert.equal(result.status, "matched");
  assert.equal(result.peerId, "user-b");
});

test("leaving a match removes the symmetric state for both users", async () => {
  await search("user-a");
  await search("user-b");

  await leave("user-a");

  assert.equal((await getStatus("user-a")).status, "idle");
  assert.equal((await getStatus("user-b")).status, "idle");
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});

test("concurrent searches preserve one-to-one matching", async () => {
  await Promise.all([
    search("user-a"),
    search("user-b"),
    search("user-c"),
  ]);

  const states = new Map(
    await Promise.all(
      ["user-a", "user-b", "user-c"].map(async (userId) => [
        userId,
        await getStatus(userId),
      ]),
    ),
  );
  const matchedUsers = [...states.entries()].filter(
    ([, state]) => state.status === "matched",
  );
  const waitingUsers = [...states.entries()].filter(
    ([, state]) => state.status === "waiting",
  );

  assert.equal(matchedUsers.length, 2);
  assert.equal(waitingUsers.length, 1);

  const [[userId, match]] = matchedUsers;
  const peerMatch = states.get(match.peerId);
  assert.equal(peerMatch.status, "matched");
  assert.equal(peerMatch.peerId, userId);
  assert.equal(peerMatch.callId, match.callId);
});

test("concurrent claims cannot assign the same candidate twice", async () => {
  const now = Date.now();
  await Promise.all(["user-a", "user-b", "user-c"].map((userId) =>
    repository.saveWaitingUser(userId, {
      userId, excludeUserId: null, excludeUntil: 0, lastSeen: now,
    })));

  const claims = await Promise.all([
    repository.tryCreateMatch("user-a", "user-b", "call-ab"),
    repository.tryCreateMatch("user-c", "user-b", "call-cb"),
  ]);

  assert.equal(claims.filter(Boolean).length, 1);
  const b = await repository.getMatch("user-b");
  const peer = await repository.getMatch(b.peerId);
  assert.equal(peer.peerId, "user-b");
  assert.equal(peer.callId, b.callId);
});

test("immediate rematch is blocked during cooldown", async () => {
  await search("user-a");
  const firstMatch = await search("user-b");

  await leave("user-a");
  const resultA = await search("user-a", "user-b");
  const resultB = await search("user-b", "user-a");

  assert.equal(firstMatch.status, "matched");
  assert.equal(resultA.status, "waiting");
  assert.equal(resultB.status, "waiting");
  assert.equal((await getStatus("user-a")).status, "waiting");
  assert.equal((await getStatus("user-b")).status, "waiting");
});

test("an excluded candidate is not selected", async () => {
  const resultA = await search("user-a", "user-b");
  const resultB = await search("user-b");

  assert.deepEqual(resultA, { status: "waiting" });
  assert.deepEqual(resultB, { status: "waiting" });
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});

test("waiting TTL cleanup removes stale user entries", async () => {
  await repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen: Date.now() - 31_000,
  });

  await getStatus("user-a");

  assert.equal((await getStatus("user-a")).status, "idle");
});

test("status refresh updates a live waiting user's timestamp", async () => {
  const lastSeen = Date.now() - 1_000;
  await repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen,
  });

  const status = await getStatus("user-a");
  const refreshedUser = await repository.getWaitingUser("user-a");

  assert.equal(status.status, "waiting");
  assert.equal(refreshedUser?.userId, "user-a");
  assert.ok(refreshedUser.lastSeen > lastSeen);
});

test("expired matches are removed symmetrically", async () => {
  await search("user-a");
  await search("user-b");
  assert.equal((await getStatus("user-a")).status, "matched");
  const redis = getRedisClient();
  await redis.pExpire(redisKeys.match("user-a"), 1);
  await redis.pExpire(redisKeys.match("user-b"), 1);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(await getStatus("user-a"), { status: "idle" });
  assert.deepEqual(await getStatus("user-b"), { status: "idle" });
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});
