import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { createSocketAuthMiddleware } from "./socket.auth.js";

const runMiddleware = (middleware, socket) => new Promise((resolve) => {
  middleware(socket, (error) => resolve(error));
});

test("socket authentication rejects a connection without the JWT cookie", async () => {
  const socket = { handshake: { headers: {} }, data: {} };
  const error = await runMiddleware(createSocketAuthMiddleware({
    jwtSecret: "test-secret",
    findUser: async () => ({ _id: "user-a" }),
  }), socket);
  assert.equal(error?.data?.code, "UNAUTHORIZED");
});

test("socket authentication derives user identity from a valid JWT cookie", async () => {
  const token = jwt.sign({ userId: "user-a" }, "test-secret", { expiresIn: "1m" });
  const socket = {
    handshake: { headers: { cookie: `theme=dark; jwt=${token}` } },
    data: {},
  };
  const error = await runMiddleware(createSocketAuthMiddleware({
    jwtSecret: "test-secret",
    findUser: async (userId) => ({ _id: userId, user_name: "A" }),
  }), socket);
  assert.equal(error, undefined);
  assert.equal(socket.data.userId, "user-a");
  assert.equal(socket.data.user.user_name, "A");
});

test("socket authentication rejects an invalid JWT", async () => {
  const socket = {
    handshake: { headers: { cookie: "jwt=not-a-token" } },
    data: {},
  };
  const error = await runMiddleware(createSocketAuthMiddleware({
    jwtSecret: "test-secret",
    findUser: async () => ({ _id: "user-a" }),
  }), socket);
  assert.equal(error?.data?.code, "UNAUTHORIZED");
});
