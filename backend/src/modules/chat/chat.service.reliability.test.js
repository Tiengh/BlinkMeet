import assert from "node:assert/strict";
import { test } from "node:test";
import { updateLastMessageBestEffort } from "./chat.service.js";

test("conversation lastMessage update is attempted", async () => {
  const calls = [];
  await updateLastMessageBestEffort("conversation", "message", async (...args) => calls.push(args));
  assert.deepEqual(calls, [["conversation", "message"]]);
});

test("failed metadata write does not reject a committed message", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  await assert.doesNotReject(updateLastMessageBestEffort("conversation", "message",
    async () => {throw new Error("simulated timeout");}));
  assert.equal(errors.length, 1);
});
