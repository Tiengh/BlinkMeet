import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseLoginInput,
  parseOnboardingInput,
  parseSignupInput,
} from "./auth.validation.js";

test("signup validation normalizes email and trims the display name", () => {
  assert.deepEqual(
    parseSignupInput({
      email: " User@Example.COM ",
      password: "strong-password",
      name: "  Test User  ",
    }),
    {
      email: "user@example.com",
      password: "strong-password",
      name: "Test User",
    },
  );
});

test("authentication validation rejects oversized bcrypt passwords", () => {
  assert.throws(
    () => parseLoginInput({
      email: "user@example.com",
      password: "é".repeat(40),
    }),
    /72 UTF-8 bytes/,
  );
});

test("onboarding validation rejects non-HTTP avatar URLs", () => {
  assert.throws(
    () => parseOnboardingInput({
      name: "Test User",
      bio: "Learning languages",
      nativeLanguage: "english",
      learningLanguage: "vietnamese",
      location: "Ho Chi Minh City",
      profilePic: "javascript:alert(1)",
    }),
    /HTTP or HTTPS/,
  );
});
