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

const inactiveTransition = async () => ({
  changed: false,
  status: "online",
  version: 1,
});

test("presence subscription authorizes, joins rooms, then reads snapshot", async () => {
  const { socket, handlers, joined } = createSocket();
  const requestedBy = [];
  const operations = [];
  socket.join = async (room) => {
    operations.push(`join:${room}`);
    joined.push(room);
  };

  registerPresenceSocket(socket, {
    connectPresence: inactiveTransition,
    disconnectPresence: async () => ({
      changed: false,
      status: "offline",
      version: 1,
    }),
    refreshPresence: inactiveTransition,
    getAllowedFriendIds: async (userId, requestedIds) => {
      operations.push("authorize");
      requestedBy.push([userId, requestedIds]);
      return ["friend-a"];
    },
    getPresenceForUsers: async (friendIds) => {
      operations.push("snapshot");
      assert.deepEqual(friendIds, ["friend-a"]);
      return { "friend-a": { status: "online", version: 7 } };
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
  assert.deepEqual(operations, [
    "authorize",
    "join:presence:watch:friend-a",
    "snapshot",
  ]);
  assert.equal(response.ok, true);
  assert.deepEqual(response.statuses["friend-a"], {
    status: "online",
    version: 7,
  });
});

test("presence subscriptions are serialized per socket", async () => {
  const { socket, handlers } = createSocket();
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const authorizeCalls = [];

  registerPresenceSocket(socket, {
    connectPresence: inactiveTransition,
    disconnectPresence: async () => ({
      changed: false,
      status: "offline",
      version: 1,
    }),
    refreshPresence: inactiveTransition,
    getAllowedFriendIds: async (_userId, requestedIds) => {
      authorizeCalls.push(requestedIds);
      if (authorizeCalls.length === 1) {await firstGate;}
      return requestedIds;
    },
    getPresenceForUsers: async () => ({}),
  });

  const firstResponse = new Promise((resolve) => {
    handlers.get("presence:subscribe")({ userIds: ["friend-a"] }, resolve);
  });
  const secondResponse = new Promise((resolve) => {
    handlers.get("presence:subscribe")({ userIds: ["friend-b"] }, resolve);
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(authorizeCalls, [["friend-a"]]);

  releaseFirst();
  await Promise.all([firstResponse, secondResponse]);
  handlers.get("disconnect")();

  assert.deepEqual(authorizeCalls, [["friend-a"], ["friend-b"]]);
});

test("disconnect emits versioned offline only when the last socket leaves", async () => {
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
    connectPresence: async () => ({
      changed: true,
      status: "online",
      version: 11,
    }),
    disconnectPresence: async () => {
      resolveDisconnected();
      return {
        changed: true,
        status: "offline",
        version: 12,
      };
    },
    refreshPresence: inactiveTransition,
    getAllowedFriendIds: async () => [],
    getPresenceForUsers: async () => ({}),
  });

  await new Promise((resolve) => setImmediate(resolve));
  handlers.get("disconnect")();
  await disconnected;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(delivered.map(({ payload }) => payload), [
    { userId: "authenticated-user", status: "online", version: 11 },
    { userId: "authenticated-user", status: "offline", version: 12 },
  ]);
  configurePresenceEvents(null);
});
