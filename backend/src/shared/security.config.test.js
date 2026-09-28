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

test("production security config rejects the development JWT secret", () => {
  assert.throws(
    () => validateSecurityEnvironment({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "blinkmeet-local-jwt-secret-change-me",
      CLIENT_ORIGIN: "https://blinkmeet.example",
    }),
    /public example or local development secret/,
  );
});

test("production security config rejects the development TURN secret", () => {
  assert.throws(
    () => validateSecurityEnvironment({
      NODE_ENV: "production",
      JWT_SECRET_KEY: "j".repeat(32),
      CLIENT_ORIGIN: "https://blinkmeet.example",
      WEBRTC_TURN_URLS: "turn:turn.blinkmeet.example:3478",
      TURN_SHARED_SECRET: "blinkmeet-local-turn-secret",
    }),
    /TURN_SHARED_SECRET/,
  );
});
