import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { after, before, beforeEach, test } from "node:test";
import { promisify } from "node:util";

process.env.REDIS_KEY_PREFIX = `blinkmeet:test:${process.pid}`;
const { connectRedis, getRedisClient } = await import("../../infrastructure/redis/redis.client.js");
const { redisKeys } = await import("../../infrastructure/redis/redis.keys.js");
const repository = await import("./matchmaking.repository.js");
const { getStatus, leave, renewMatch, search } = await import("./matchmaking.service.js");
const execFileAsync = promisify(execFile);

const session = (userId, suffix = "main") => `${userId}-${suffix}-session`;
const searchUser = (userId, excludeUserId = null, sessionId = session(userId)) =>
  search(userId, excludeUserId, sessionId);
const statusUser = (userId, sessionId = session(userId)) =>
  getStatus(userId, sessionId);
const leaveUser = (userId, sessionId = session(userId), callId = null) =>
  leave(userId, sessionId, callId);

before(connectRedis);
after(async () => {await getRedisClient().quit();});

beforeEach(repository.clearAllMatchmakingState);

test("repository exposes explicit waiting-user storage methods", () => {
  assert.equal(typeof repository.saveWaitingUser, "function");
  assert.equal(typeof repository.refreshWaitingUser, "function");
  assert.equal(typeof repository.getWaitingUsers, "function");
  assert.equal(typeof repository.tryCreateMatch, "function");
  assert.equal(typeof repository.removeMatch, "function");
  assert.equal(typeof repository.isSessionCancelled, "function");
  assert.equal(typeof repository.clearAllMatchmakingState, "function");
});

test("first user waits when no candidate is available", async () => {
  const result = await searchUser("user-a");
  assert.deepEqual(result, { status: "waiting" });
  assert.equal((await statusUser("user-a")).status, "waiting");
});

test("two waiting users match and share the same callId", async () => {
  await searchUser("user-a");
  const result = await searchUser("user-b");
  assert.equal(result.status, "matched");
  assert.ok(result.callId);
  assert.equal(result.peerId, "user-a");
  const matchForA = await statusUser("user-a");
  const matchForB = await statusUser("user-b");
  assert.equal(matchForA.status, "matched");
  assert.equal(matchForB.status, "matched");
  assert.equal(matchForA.callId, matchForB.callId);
  assert.equal(matchForA.peerId, "user-b");
  assert.equal(matchForB.peerId, "user-a");
});

test("a separate backend process shares the Redis matchmaking queue", async () => {
  await searchUser("user-a");
  const script = `
    import { connectRedis, getRedisClient } from ${JSON.stringify(new URL("../../infrastructure/redis/redis.client.js", import.meta.url).href)};
    import { search } from ${JSON.stringify(new URL("./matchmaking.service.js", import.meta.url).href)};
    await connectRedis();
    console.log(JSON.stringify(await search("user-b", null, "user-b-main-session")));
    await getRedisClient().quit();
  `;
  const { stdout } = await execFileAsync(process.execPath,
    ["--input-type=module", "-e", script], { env: process.env });
  const matchForB = JSON.parse(stdout.trim());
  const matchForA = await statusUser("user-a");
  assert.equal(matchForB.peerId, "user-a");
  assert.equal(matchForA.peerId, "user-b");
  assert.equal(matchForA.callId, matchForB.callId);
});

test("active users cannot be reused by a third user", async () => {
  await searchUser("user-a");
  await searchUser("user-b");
  const result = await searchUser("user-c");
  assert.deepEqual(result, { status: "waiting" });
  assert.equal((await statusUser("user-c")).status, "waiting");
});

test("repeated searches keep a single waiting entry", async () => {
  const firstResult = await searchUser("user-a");
  const secondResult = await searchUser("user-a");
  const waitingUsers = await repository.getWaitingUsers();
  assert.deepEqual(firstResult, { status: "waiting" });
  assert.deepEqual(secondResult, { status: "waiting" });
  assert.equal(waitingUsers.length, 1);
  assert.equal(waitingUsers[0].userId, "user-a");
  assert.equal(waitingUsers[0].sessionId, session("user-a"));
});

test("repeated search returns the existing match without corrupting it", async () => {
  await searchUser("user-a");
  const originalMatch = await searchUser("user-b");
  const repeatedMatch = await searchUser("user-b");
  const peerMatch = await statusUser("user-a");
  assert.deepEqual(repeatedMatch, originalMatch);
  assert.equal(peerMatch.callId, originalMatch.callId);
  assert.equal(peerMatch.peerId, "user-b");
  assert.equal(await repository.getWaitingUser("user-b"), undefined);
});

test("concurrent repeated searches do not requeue a matched user", async () => {
  await searchUser("user-a");
  await Promise.all([
    searchUser("user-b"),
    searchUser("user-a"),
    searchUser("user-a"),
  ]);
  const matchA = await statusUser("user-a");
  const matchB = await statusUser("user-b");
  assert.equal(matchA.status, "matched");
  assert.equal(matchA.peerId, "user-b");
  assert.equal(matchB.peerId, "user-a");
  assert.equal(matchA.callId, matchB.callId);
  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.equal(await repository.getWaitingUser("user-b"), undefined);
});

test("a waiting user can leave and start a new session normally", async () => {
  const firstSession = session("user-a", "first");
  const secondSession = session("user-a", "second");
  await searchUser("user-a", null, firstSession);
  await leaveUser("user-a", firstSession);
  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.deepEqual(await statusUser("user-a", firstSession), { status: "cancelled" });
  await searchUser("user-b");
  const result = await searchUser("user-a", null, secondSession);
  assert.equal(result.status, "matched");
  assert.equal(result.peerId, "user-b");
});

test("leaving a match removes the symmetric state for both users", async () => {
  await searchUser("user-a");
  const match = await searchUser("user-b");
  const result = await leaveUser("user-a", session("user-a"), match.callId);
  assert.deepEqual(result, { success: true });
  assert.equal((await statusUser("user-a")).status, "cancelled");
  assert.equal((await statusUser("user-b")).status, "cancelled");
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});

test("concurrent searches preserve one-to-one matching", async () => {
  await Promise.all([
    searchUser("user-a"),
    searchUser("user-b"),
    searchUser("user-c"),
  ]);
  const states = new Map(
    await Promise.all(
      ["user-a", "user-b", "user-c"].map(async (userId) => [
        userId,
        await statusUser(userId),
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
      userId,
      sessionId: session(userId),
      excludeUserId: null,
      excludeUntil: 0,
      lastSeen: now,
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
  await searchUser("user-a");
  const firstMatch = await searchUser("user-b");
  await leaveUser("user-a", session("user-a"), firstMatch.callId);
  const sessionA2 = session("user-a", "second");
  const sessionB2 = session("user-b", "second");
  const resultA = await searchUser("user-a", "user-b", sessionA2);
  const resultB = await searchUser("user-b", "user-a", sessionB2);
  assert.equal(firstMatch.status, "matched");
  assert.equal(resultA.status, "waiting");
  assert.equal(resultB.status, "waiting");
  assert.equal((await statusUser("user-a", sessionA2)).status, "waiting");
  assert.equal((await statusUser("user-b", sessionB2)).status, "waiting");
});

test("an excluded candidate is not selected", async () => {
  const resultA = await searchUser("user-a", "user-b");
  const resultB = await searchUser("user-b");
  assert.deepEqual(resultA, { status: "waiting" });
  assert.deepEqual(resultB, { status: "waiting" });
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});

test("waiting TTL cleanup removes stale user entries", async () => {
  await repository.saveWaitingUser("user-a", {
    userId: "user-a",
    sessionId: session("user-a"),
    excludeUserId: null,
    excludeUntil: 0,
    lastSeen: Date.now() - 31_000,
  });
  await statusUser("user-a");
  assert.equal((await statusUser("user-a")).status, "idle");
});

test("status refresh updates a live waiting user's timestamp", async () => {
  const lastSeen = Date.now() - 1_000;
  await repository.saveWaitingUser("user-a", {
    userId: "user-a",
    sessionId: session("user-a"),
    excludeUserId: null,
    excludeUntil: 0,
    lastSeen,
  });
  const status = await statusUser("user-a");
  const refreshedUser = await repository.getWaitingUser("user-a");
  assert.equal(status.status, "waiting");
  assert.equal(refreshedUser?.userId, "user-a");
  assert.ok(refreshedUser.lastSeen > lastSeen);
});

test("expired matches are removed by Redis TTL", async () => {
  await searchUser("user-a");
  await searchUser("user-b");
  assert.equal((await statusUser("user-a")).status, "matched");
  const redis = getRedisClient();
  await redis.pExpire(redisKeys.match("user-a"), 1);
  await redis.pExpire(redisKeys.match("user-b"), 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(await statusUser("user-a"), { status: "idle" });
  assert.deepEqual(await statusUser("user-b"), { status: "idle" });
  assert.equal(await repository.getMatch("user-a"), undefined);
  assert.equal(await repository.getMatch("user-b"), undefined);
});

test("an active match lease can be renewed symmetrically", async () => {
  await searchUser("user-a");
  const match = await searchUser("user-b");
  const redis = getRedisClient();
  await redis.pExpire(redisKeys.match("user-a"), 1_000);
  await redis.pExpire(redisKeys.match("user-b"), 1_000);
  assert.equal(await renewMatch("user-a", session("user-a"), match.callId), true);
  assert.ok(await redis.pTTL(redisKeys.match("user-a")) > 60_000);
  assert.ok(await redis.pTTL(redisKeys.match("user-b")) > 60_000);
});

test("a cancelled session cannot be resurrected by a delayed search", async () => {
  const oldSession = session("user-a", "old");
  await leaveUser("user-a", oldSession);
  const delayedSearch = await searchUser("user-a", null, oldSession);
  assert.deepEqual(delayedSearch, { status: "cancelled" });
  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.equal(await repository.getMatch("user-a"), undefined);
});

test("concurrent search and leave finish with the session cancelled", async () => {
  const sessionId = session("user-a", "race");
  await Promise.all([
    searchUser("user-a", null, sessionId),
    leaveUser("user-a", sessionId),
  ]);
  assert.deepEqual(await statusUser("user-a", sessionId), { status: "cancelled" });
  assert.equal(await repository.getWaitingUser("user-a"), undefined);
  assert.equal(await repository.getMatch("user-a"), undefined);
});

test("a stale leave cannot remove a newer waiting session", async () => {
  const oldSession = session("user-a", "old");
  const newSession = session("user-a", "new");
  await leaveUser("user-a", oldSession);
  await searchUser("user-a", null, newSession);
  await leaveUser("user-a", oldSession);
  assert.equal((await statusUser("user-a", newSession)).status, "waiting");
  assert.equal((await repository.getWaitingUser("user-a"))?.sessionId, newSession);
});

test("a stale leave cannot remove a newer match", async () => {
  const oldSession = session("user-a", "old");
  const newSession = session("user-a", "new");
  await leaveUser("user-a", oldSession);
  await searchUser("user-b");
  const newMatch = await searchUser("user-a", null, newSession);
  await leaveUser("user-a", oldSession);
  const matchA = await statusUser("user-a", newSession);
  const matchB = await statusUser("user-b");
  assert.equal(matchA.callId, newMatch.callId);
  assert.equal(matchB.callId, newMatch.callId);
  assert.equal(matchA.peerId, "user-b");
  assert.equal(matchB.peerId, "user-a");
});

test("a second session for the same user cannot replace an active waiting session", async () => {
  await searchUser("user-a", null, session("user-a", "first"));
  const second = await searchUser("user-a", null, session("user-a", "second"));
  assert.deepEqual(second, { status: "session-conflict" });
  assert.equal(
    (await repository.getWaitingUser("user-a"))?.sessionId,
    session("user-a", "first"),
  );
});

test("a leave with the wrong callId cannot remove the current match", async () => {
  await searchUser("user-a");
  const match = await searchUser("user-b");
  const result = await leaveUser("user-a", session("user-a"), "wrong-call-id");
  assert.deepEqual(result, { success: false, stale: true });
  assert.equal((await statusUser("user-a")).callId, match.callId);
  assert.equal((await statusUser("user-b")).callId, match.callId);
  assert.equal(await repository.isSessionCancelled("user-a", session("user-a")), 0);
});
