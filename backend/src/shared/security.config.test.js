import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSecurityEnvironment } from "./security.config.js";

test("production security config requires an explicit client origin", () => {
  assert.throws(
    () => validateSecurityEnvironment({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "a".repeat(32),
    }),
    /CLIENT_ORIGIN/,
  );
});

test("production security config rejects weak JWT secrets", () => {
  assert.throws(
    () => validateSecurityEnvironment({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "short-secret",
      CLIENT_ORIGIN: "https://blinkmeet.example",
    }),
    /at least 32/,
  );
});
