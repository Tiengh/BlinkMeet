import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configureChatEvents,
  registerChatSocket,
} from "./chat.events.js";

const createSocket = () => {
  const handlers = new Map();
  return {
    socket: {
      data: { userId: "authenticated-user" },
      on: (event, handler) => handlers.set(event, handler),
    },
    handlers,
  };
};

test("chat send uses the authenticated socket identity", async () => {
  const delivered = [];
  configureChatEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });
  const { socket, handlers } = createSocket();
  const calls = [];
  registerChatSocket(socket, {
    sendMessage: async (...args) => {
      calls.push(args);
      return {
        _id: "message-1",
        conversation: "conversation-1",
        sender: "authenticated-user",
        recipient: "friend-user",
        content: "Hello",
        status: "sent",
      };
    },
  });

  const response = await new Promise((resolve) => {
    handlers.get("chat:send")({
      senderId: "forged-user",
      recipientId: "friend-user",
      content: "Hello",
    }, resolve);
  });

  assert.equal(calls[0][0], "authenticated-user");
  assert.equal(response.ok, true);
  assert.deepEqual(delivered.map(({ room }) => room), [
    "user:authenticated-user",
    "user:friend-user",
  ]);
  configureChatEvents(null);
});

test("seen status is emitted only to the message sender", async () => {
  const delivered = [];
  configureChatEvents({
    to: (room) => ({
      emit: (event, payload) => delivered.push({ room, event, payload }),
    }),
  });
  const { socket, handlers } = createSocket();
  registerChatSocket(socket, {
    seeConversation: async () => ({
      messageIds: ["message-1", "message-2"],
      senderId: "friend-user",
    }),
  });

  const response = await new Promise((resolve) => {
    handlers.get("chat:seen")({ conversationId: "conversation-1" }, resolve);
  });

  assert.equal(response.ok, true);
  assert.deepEqual(delivered[0], {
    room: "user:friend-user",
    event: "chat:status",
    payload: {
      messageIds: ["message-1", "message-2"],
      status: "seen",
    },
  });
  configureChatEvents(null);
});
