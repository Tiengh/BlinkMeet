import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configureCallEvents,
  registerCallSocket,
} from "./call.events.js";

const createSocket = () => {
  const handlers = new Map();
  return {
    handlers,
    socket: {
      data: { userId: "authenticated-user" },
      on: (event, handler) => handlers.set(event, handler),
    },
  };
};

test("offer signaling uses authenticated identity and authorized peer", async () => {
  const delivered = [];
  configureCallEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });
  const { handlers, socket } = createSocket();
  const authorizations = [];
  registerCallSocket(socket, {
    authorizeCallSignal: async (...args) => authorizations.push(args),
  });

  const response = await new Promise((resolve) => {
    handlers.get("call:offer")({
      callId: "call-1",
      peerId: "peer-user",
      sessionId: "session-1",
      description: { type: "offer", sdp: "test-sdp" },
      fromUserId: "forged-user",
    }, resolve);
  });

  assert.equal(response.ok, true);
  assert.equal(authorizations[0][0], "authenticated-user");
  assert.deepEqual(delivered, [{
    room: "user:peer-user",
    event: "call:offer",
    payload: {
      callId: "call-1",
      fromUserId: "authenticated-user",
      description: { type: "offer", sdp: "test-sdp" },
    },
  }]);
  configureCallEvents(null);
});

test("invalid ICE candidates are rejected before authorization", async () => {
  const { handlers, socket } = createSocket();
  let authorizationCount = 0;
  registerCallSocket(socket, {
    authorizeCallSignal: async () => {authorizationCount += 1;},
  });

  const response = await new Promise((resolve) => {
    handlers.get("call:ice-candidate")({
      callId: "call-1",
      peerId: "peer-user",
      sessionId: "session-1",
      candidate: null,
    }, resolve);
  });

  assert.equal(response.ok, false);
  assert.equal(response.code, "SIGNAL_REJECTED");
  assert.equal(authorizationCount, 0);
});
