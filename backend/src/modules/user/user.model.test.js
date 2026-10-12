import assert from "node:assert/strict";
import { test } from "node:test";
import User from "./user.model.js";

test("user email is normalized before persistence", () => {
  const user = new User({
    user_name: "Test User",
    user_email: " User@Example.COM ",
    user_password: "strong-password",
  });

  assert.equal(user.user_email, "user@example.com");
});
