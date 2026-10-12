import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthCookieOptions } from "./auth.cookie.js";

test("auth cookies are secure in production", () => {
  assert.deepEqual(
    getAuthCookieOptions({ NODE_ENV: "production" }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    },
  );
});

test("SameSite=None cannot be configured without Secure", () => {
  assert.throws(
    () => getAuthCookieOptions({
      NODE_ENV: "development",
      COOKIE_SAME_SITE: "none",
      COOKIE_SECURE: "false",
    }),
    /COOKIE_SECURE/,
  );
});
