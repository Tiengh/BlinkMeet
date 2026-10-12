import assert from "node:assert/strict";
import { test } from "node:test";
import { findUserByEmail } from "./auth.repository.js";

const createUserModel = (responses) => {
  const calls = [];
  return {
    calls,
    model: {
      findOne(filter) {
        calls.push(filter);
        return {
          select: async () => responses.shift() ?? null,
        };
      },
    },
  };
};

test("email lookup prefers the normalized exact value", async () => {
  const expectedUser = { _id: "user-a" };
  const { calls, model } = createUserModel([expectedUser]);

  const user = await findUserByEmail(" User@Example.COM ", { UserModel: model });

  assert.equal(user, expectedUser);
  assert.deepEqual(calls, [{ user_email: "user@example.com" }]);
});

test("email lookup falls back to a case-insensitive legacy lookup", async () => {
  const legacyUser = { _id: "legacy-user" };
  const { calls, model } = createUserModel([null, legacyUser]);

  const user = await findUserByEmail("user+tag@example.com", { UserModel: model });

  assert.equal(user, legacyUser);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].user_email.$options, "i");
  assert.equal(calls[1].user_email.$regex, "^user\\+tag@example\\.com$");
});
