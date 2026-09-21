import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configureMatchmakingEvents,
  emitMatchCancelled,
  emitMatchCreated,
  registerMatchmakingSocket,
} from "./matchmaking.events.js";

test("matched events are delivered to both server-derived user rooms", () => {
  const delivered = [];
  configureMatchmakingEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });

  emitMatchCreated([
    { userId: "a", sessionId: "session-a", callId: "call-1", peerId: "b" },
    { userId: "b", sessionId: "session-b", callId: "call-1", peerId: "a" },
  ]);

  assert.deepEqual(delivered.map(({ room, event }) => ({ room, event })), [
    { room: "user:a", event: "matchmaking:matched" },
    { room: "user:b", event: "matchmaking:matched" },
  ]);
  assert.equal(delivered[0].payload.callId, delivered[1].payload.callId);
  configureMatchmakingEvents(null);
});

test("cancel emits a lifecycle-scoped peer-left event", () => {
  const delivered = [];
  configureMatchmakingEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });
  emitMatchCancelled({
    userId: "a",
    sessionId: "session-a",
    callId: "call-1",
    peerId: "b",
    peerSessionId: "session-b",
  });
  assert.equal(delivered[0].event, "matchmaking:cancelled");
  assert.deepEqual(delivered[1], {
    room: "user:b",
    event: "call:peer-left",
    payload: { callId: "call-1", sessionId: "session-b", peerId: "a" },
  });
  configureMatchmakingEvents(null);
});

test("socket cancel uses authenticated identity and acknowledges the result", async () => {
  const handlers = new Map();
  const calls = [];
  const socket = {
    data: { userId: "authenticated-user" },
    on: (event, handler) => handlers.set(event, handler),
    emit: () => {},
  };
  registerMatchmakingSocket(socket, {
    getStatus: async () => ({ status: "idle" }),
    renewMatch: async () => true,
    leave: async (...args) => {
      calls.push(args);
      return { success: true };
    },
  });

  const response = await new Promise((resolve) => {
    handlers.get("matchmaking:cancel")(
      { userId: "forged-user", sessionId: "session-a", callId: "call-1" },
      resolve,
    );
  });
  handlers.get("disconnect")();

  assert.deepEqual(calls, [["authenticated-user", "session-a", "call-1"]]);
  assert.equal(response.ok, true);
});
