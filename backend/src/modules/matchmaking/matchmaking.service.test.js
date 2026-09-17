import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import * as repository from "./matchmaking.repository.js";
import { getStatus, leave, search } from "./matchmaking.service.js";

beforeEach(() => {
  repository.clearAllMatchmakingState();
});

test("repository exposes explicit waiting-user storage methods", () => {
  assert.equal(typeof repository.saveWaitingUser, "function");
  assert.equal(typeof repository.refreshWaitingUser, "function");
  assert.equal(typeof repository.getWaitingUsers, "function");
  assert.equal(typeof repository.saveMatch, "function");
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

test("leave removes both waiting and matched state", async () => {
  await search("user-a");
  await search("user-b");

  await leave("user-a");

  assert.equal((await getStatus("user-a")).status, "idle");
  assert.equal((await getStatus("user-b")).status, "idle");

  await search("user-c");
  await leave("user-c");

  assert.equal((await getStatus("user-c")).status, "idle");
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

test("waiting TTL cleanup removes stale user entries", async () => {
  repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen: Date.now() - 31_000,
  });

  await getStatus("user-a");

  assert.equal((await getStatus("user-a")).status, "idle");
});

test("status refresh updates waiting user timestamp without dropping it", async () => {
  repository.saveWaitingUser("user-a", {
    userId: "user-a",
    lastSeen: 1,
  });

  const status = await getStatus("user-a");
  const refreshedUser = repository.getWaitingUser("user-a");

  assert.equal(status.status, "waiting");
  assert.equal(refreshedUser?.userId, "user-a");
  assert.ok(refreshedUser.lastSeen > 1);
});
