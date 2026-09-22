import { PRESENCE_HEARTBEAT_INTERVAL } from "./presence.constants.js";

let socketServer;

const watchRoom = (userId) => `presence:watch:${userId}`;

export const configurePresenceEvents = (io) => {
  socketServer = io;
};

export const emitPresenceChanged = (userId, status) => {
  if (!socketServer) {return;}
  socketServer.to(watchRoom(userId)).emit("presence:changed", {
    userId: String(userId),
    status,
  });
};

const parseRequestedUserIds = (payload) => {
  if (payload?.userIds === undefined) {return null;}
  if (!Array.isArray(payload.userIds) || payload.userIds.length > 200) {
    throw new Error("userIds must be an array with at most 200 entries");
  }
  return payload.userIds.map(String);
};

export const registerPresenceSocket = (socket, {
  connectPresence,
  disconnectPresence,
  getFriendPresence,
  refreshPresence,
}) => {
  const userId = String(socket.data.userId);
  let subscribedFriendIds = new Set();
  let lifecycleOperation = Promise.resolve();

  const queueLifecycleOperation = (operation) => {
    lifecycleOperation = lifecycleOperation
      .catch((error) => {
        console.error("Previous presence operation failed:", error);
      })
      .then(operation);
    return lifecycleOperation;
  };

  queueLifecycleOperation(async () => {
    if (await connectPresence(userId, socket.id)) {
      emitPresenceChanged(userId, "online");
    }
  }).catch((error) => console.error("Presence connection failed:", error));

  socket.on("presence:subscribe", async (payload = {}, acknowledge = () => {}) => {
    try {
      const requestedUserIds = parseRequestedUserIds(payload);
      const result = await getFriendPresence(userId, requestedUserIds);
      const nextFriendIds = new Set(result.friendIds.map(String));

      await Promise.all([
        ...[...subscribedFriendIds]
          .filter((friendId) => !nextFriendIds.has(friendId))
          .map((friendId) => socket.leave(watchRoom(friendId))),
        ...[...nextFriendIds]
          .filter((friendId) => !subscribedFriendIds.has(friendId))
          .map((friendId) => socket.join(watchRoom(friendId))),
      ]);
      subscribedFriendIds = nextFriendIds;
      acknowledge({ ok: true, statuses: result.statuses });
    } catch (error) {
      acknowledge({
        ok: false,
        code: error.message.startsWith("userIds must")
          ? "INVALID_PAYLOAD"
          : "INTERNAL_ERROR",
        error: error.message,
      });
    }
  });

  const heartbeatTimer = setInterval(() => {
    queueLifecycleOperation(async () => {
      if (await refreshPresence(userId, socket.id)) {
        emitPresenceChanged(userId, "online");
      }
    }).catch((error) => console.error("Presence refresh failed:", error));
  }, PRESENCE_HEARTBEAT_INTERVAL);
  heartbeatTimer.unref?.();

  socket.on("disconnect", () => {
    clearInterval(heartbeatTimer);
    queueLifecycleOperation(async () => {
      if (await disconnectPresence(userId, socket.id)) {
        emitPresenceChanged(userId, "offline");
      }
    }).catch((error) => console.error("Presence disconnect failed:", error));
  });
};
