import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import app from "./app.js";

const withServer = async (callback) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("HTTP responses include security headers without exposing Express", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  });
});

test("CORS rejects browser requests from an unapproved origin", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/health`, {
      headers: { Origin: "https://attacker.example" },
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json()).message, "Origin is not allowed by CORS");
  });
});

test("readiness fails when database and Redis are unavailable", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { success: false });
  });
});

test("unknown API routes return JSON 404 instead of a missing frontend index.html", async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/nonexistent-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      message: "Route not found",
    });
  });
});
