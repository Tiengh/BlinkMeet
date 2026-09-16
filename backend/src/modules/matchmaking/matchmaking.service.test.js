import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import * as repository from "./matchmaking.repository.js";
import { search, getStatus, leave } from "./matchmaking.service.js";

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

test("first user waits when no candidate is available", () => {
  const result = search("user-a");

  assert.deepEqual(result, { status: "waiting" });
  assert.equal(getStatus("user-a").status, "waiting");
});

test("two waiting users match and share the same callId", () => {
  search("user-a");
  const result = search("user-b");

  assert.equal(result.status, "matched");
  assert.ok(result.callId);
  assert.equal(result.peerId, "user-a");

  const matchForA = getStatus("user-a");
  const matchForB = getStatus("user-b");

  assert.equal(matchForA.status, "matched");
  assert.equal(matchForB.status, "matched");
  assert.equal(matchForA.callId, matchForB.callId);
  assert.equal(matchForA.peerId, "user-b");
  assert.equal(matchForB.peerId, "user-a");
});

test("active users cannot be reused by a third user", () => {
  search("user-a");
  search("user-b");

  const result = search("user-c");

  assert.deepEqual(result, { status: "waiting" });
  assert.equal(getStatus("user-c").status, "waiting");
});

test("leave removes both waiting and matched state", () => {
  search("user-a");
  search("user-b");

  leave("user-a");

  assert.equal(getStatus("user-a").status, "idle");
  assert.equal(getStatus("user-b").status, "idle");

  search("user-c");
  leave("user-c");

  assert.equal(getStatus("user-c").status, "idle");
});

test("immediate rematch is blocked during cooldown", () => {
  search("user-a");
  const firstMatch = search("user-b");

  leave("user-a");
  const result = search("user-a", "user-b");

  assert.equal(firstMatch.status, "matched");
  assert.equal(result.status, "waiting");
  assert.equal(getStatus("user-a").status, "waiting");
});

test("waiting TTL cleanup removes stale user entries", () => {
  repository.saveWaitingUser("user-a", { userId: "user-a", lastSeen: Date.now() - 31_000 });

  getStatus("user-a");

  assert.equal(getStatus("user-a").status, "idle");
});

test("status refresh updates waiting user timestamp without dropping it", () => {
  search("user-a");

  const status = getStatus("user-a");

  assert.equal(status.status, "waiting");
  assert.equal(repository.getWaitingUser("user-a")?.userId, "user-a");
});
