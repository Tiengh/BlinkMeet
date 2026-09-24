import {
  deliverMessage,
  deliverPendingMessages,
  ensureCanChat,
  seeConversation,
  sendMessage,
} from "./chat.service.js";

let socketServer;

const userRoom = (userId) => `user:${userId}`;

export const configureChatEvents = (io) => {
  socketServer = io;
};

const errorReply = (reply, error) => reply({
  ok: false,
  code: error?.statusCode ? "INVALID_REQUEST" : "INTERNAL_ERROR",
  error: error?.statusCode ? error.message : "Chat operation failed",
});

export const emitMessage = (message) => {
  if (!socketServer) {return;}
  const payload = {
    ...message,
    _id: String(message._id),
    conversation: String(message.conversation),
    sender: String(message.sender),
    recipient: String(message.recipient),
  };
  socketServer.to(userRoom(payload.sender)).emit("chat:message", payload);
  socketServer.to(userRoom(payload.recipient)).emit("chat:message", payload);
};

export const emitMessageStatus = (userId, payload) => {
  if (!socketServer) {return;}
  socketServer.to(userRoom(userId)).emit("chat:status", payload);
};

export const registerChatSocket = (socket, dependencies = {}) => {
  const services = {
    deliverMessage,
    deliverPendingMessages,
    ensureCanChat,
    seeConversation,
    sendMessage,
    ...dependencies,
  };
  const userId = String(socket.data.userId);

  socket.on("chat:send", async (payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      const message = await services.sendMessage(userId, payload);
      emitMessage(message);
      reply({ ok: true, message });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  socket.on("chat:delivered", async (payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      const message = await services.deliverMessage(userId, payload.messageId);
      if (message) {
        emitMessageStatus(String(message.sender), {
          messageIds: [String(message._id)],
          status: "delivered",
        });
      }
      reply({ ok: true });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  socket.on("chat:sync-delivered", async (_payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      const deliveries = await services.deliverPendingMessages(userId);
      let deliveredCount = 0;
      deliveries.forEach(({ senderId, messageIds }) => {
        if (!messageIds.length) {return;}
        deliveredCount += messageIds.length;
        emitMessageStatus(senderId, {
          messageIds,
          status: "delivered",
        });
      });
      reply({ ok: true, deliveredCount });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  socket.on("chat:seen", async (payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      const result = await services.seeConversation(userId, payload.conversationId);
      if (result.senderId && result.messageIds.length) {
        emitMessageStatus(result.senderId, {
          messageIds: result.messageIds,
          status: "seen",
        });
      }
      reply({ ok: true, messageIds: result.messageIds });
    } catch (error) {
      errorReply(reply, error);
    }
  });

  socket.on("chat:typing", async (payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};
    try {
      const target = await services.ensureCanChat(userId, payload.recipientId);
      const isTyping = payload.isTyping === true;
      socketServer?.to(userRoom(target._id)).emit("chat:typing", {
        userId,
        isTyping,
      });
      reply({ ok: true });
    } catch (error) {
      errorReply(reply, error);
    }
  });
};
