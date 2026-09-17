import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { MATCH_TTL } from "./matchmaking.constants.js";
import * as repository from "./matchmaking.repository.js";
import { getStatus, leave, search } from "./matchmaking.service.js";

beforeEach(() => {
  repository.clearAllMatchmakingState();
});

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
  const waitingUsers = repository.getWaitingUsers();

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
  assert.equal(repository.getWaitingUser("user-b"), undefined);
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
  assert.equal(repository.getWaitingUser("user-a"), undefined);
  assert.equal(repository.getWaitingUser("user-b"), undefined);
});

test("a waiting user can leave and search again normally", async () => {
  await search("user-a");
  await leave("user-a");

  assert.equal(repository.getWaitingUser("user-a"), undefined);
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
  assert.equal(repository.getMatch("user-a"), undefined);
  assert.equal(repository.getMatch("user-b"), undefined);
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
  assert.equal(repository.getMatch("user-a"), undefined);
  assert.equal(repository.getMatch("user-b"), undefined);
});

test("waiting TTL cleanup removes stale user entries", async () => {
  repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen: Date.now() - 31_000,
  });

  await getStatus("user-a");

  assert.equal((await getStatus("user-a")).status, "idle");
});

test("status refresh updates a live waiting user's timestamp", async () => {
  const lastSeen = Date.now() - 1_000;
  repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen,
  });

  const status = await getStatus("user-a");
  const refreshedUser = repository.getWaitingUser("user-a");

  assert.equal(status.status, "waiting");
  assert.equal(refreshedUser?.userId, "user-a");
  assert.ok(refreshedUser.lastSeen > lastSeen);
});

test("expired matches are removed symmetrically", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);

  await search("user-a");
  await search("user-b");
  assert.equal((await getStatus("user-a")).status, "matched");

  now += MATCH_TTL + 1;

  assert.deepEqual(await getStatus("user-a"), { status: "idle" });
  assert.deepEqual(await getStatus("user-b"), { status: "idle" });
  assert.equal(repository.getMatch("user-a"), undefined);
  assert.equal(repository.getMatch("user-b"), undefined);
});
