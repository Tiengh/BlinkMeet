import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configurePresenceEvents,
  registerPresenceSocket,
} from "./presence.events.js";

const createSocket = () => {
  const handlers = new Map();
  const joined = [];
  const left = [];
  return {
    socket: {
      id: "socket-a",
      data: { userId: "authenticated-user" },
      on: (event, handler) => handlers.set(event, handler),
      join: async (room) => joined.push(room),
      leave: async (room) => left.push(room),
    },
    handlers,
    joined,
    left,
  };
};

test("presence subscription uses authenticated identity and friend allowlist", async () => {
  const { socket, handlers, joined } = createSocket();
  const requestedBy = [];
  registerPresenceSocket(socket, {
    connectPresence: async () => false,
    disconnectPresence: async () => false,
    refreshPresence: async () => false,
    getFriendPresence: async (userId, requestedIds) => {
      requestedBy.push([userId, requestedIds]);
      return {
        friendIds: ["friend-a"],
        statuses: { "friend-a": { status: "online" } },
      };
    },
  });

  const response = await new Promise((resolve) => {
    handlers.get("presence:subscribe")(
      { userId: "forged-user", userIds: ["friend-a", "stranger"] },
      resolve,
    );
  });
  handlers.get("disconnect")();

  assert.deepEqual(requestedBy, [[
    "authenticated-user",
    ["friend-a", "stranger"],
  ]]);
  assert.deepEqual(joined, ["presence:watch:friend-a"]);
  assert.equal(response.ok, true);
  assert.equal(response.statuses["friend-a"].status, "online");
});

test("disconnect only emits offline when the last socket leaves", async () => {
  const delivered = [];
  configurePresenceEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });
  const { socket, handlers } = createSocket();
  let resolveDisconnected;
  const disconnected = new Promise((resolve) => {
    resolveDisconnected = resolve;
  });
  registerPresenceSocket(socket, {
    connectPresence: async () => true,
    disconnectPresence: async () => {
      resolveDisconnected();
      return true;
    },
    refreshPresence: async () => false,
    getFriendPresence: async () => ({ friendIds: [], statuses: {} }),
  });

  await new Promise((resolve) => setImmediate(resolve));
  handlers.get("disconnect")();
  await disconnected;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(delivered.map(({ payload }) => payload.status), [
    "online",
    "offline",
  ]);
  configurePresenceEvents(null);
});
