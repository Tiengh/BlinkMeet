import assert from "node:assert/strict";
import test from "node:test";
import * as repository from "./matchmaking.repository.js";
import { search, getStatus, leave } from "./matchmaking.service.js";

test("repository exposes explicit waiting-user storage methods", () => {
  assert.equal(typeof repository.saveWaitingUser, "function");
  assert.equal(typeof repository.refreshWaitingUser, "function");
  assert.equal(typeof repository.getWaitingUsers, "function");
  assert.equal(typeof repository.saveMatch, "function");
});

test("search matches two waiting users and creates match records", () => {
  repository.removeWaitingUser("user-a");
  repository.removeWaitingUser("user-b");
  repository.removeMatch("user-a");
  repository.removeMatch("user-b");

  repository.saveWaitingUser("user-a", { userId: "user-a", lastSeen: Date.now() });
  const result = search("user-b");

  assert.equal(result.status, "matched");
  assert.ok(result.callId);
  assert.equal(getStatus("user-a").status, "matched");
  assert.equal(getStatus("user-b").status, "matched");

  leave("user-a");
  leave("user-b");
});
