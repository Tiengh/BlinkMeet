import assert from "node:assert/strict";
import { test } from "node:test";
import { mongoConnectionOptions } from "./mongodb.js";

test("production MongoDB connection requires TLS certificate validation", () => {
  const uri = "mongodb+srv://user:password@example.mongodb.net/blinkmeet";
  assert.deepEqual(mongoConnectionOptions(uri, { NODE_ENV: "production" }), { tls: true });
  assert.deepEqual(mongoConnectionOptions("mongodb://localhost:27017/test", { NODE_ENV: "development" }), {});
  assert.throws(() => mongoConnectionOptions(`${uri}?tlsAllowInvalidCertificates=true`, { NODE_ENV: "production" }), /Unsafe MongoDB TLS option/);
  assert.throws(() => mongoConnectionOptions(`${uri}?tls=false`, { NODE_ENV: "production" }), /Unsafe MongoDB TLS option/);
});
