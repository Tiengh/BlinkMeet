import { PRESENCE_HEARTBEAT_INTERVAL } from "./presence.constants.js";

let socketServer;

const watchRoom = (userId) => `presence:watch:${userId}`;

export const configurePresenceEvents = (io) => {
  socketServer = io;
};

export const emitPresenceChanged = (userId, status, version) => {
  if (!socketServer) {return;}
  socketServer.to(watchRoom(userId)).emit("presence:changed", {
    userId: String(userId),
    status,
    version: Number(version),
  });
};

const parseRequestedUserIds = (payload) => {
  if (payload?.userIds === undefined) {return null;}
  if (!Array.isArray(payload.userIds) || payload.userIds.length > 200) {
    throw new Error("userIds must be an array with at most 200 entries");
  }
  return [...new Set(payload.userIds.map(String))];
};

const emitTransition = (userId, transition) => {
  if (!transition?.changed) {return;}
  emitPresenceChanged(
    userId,
    transition.status,
    transition.version,
  );
};

export const registerPresenceSocket = (socket, {
  connectPresence,
  disconnectPresence,
  getAllowedFriendIds,
  getPresenceForUsers,
  refreshPresence,
}) => {
  const userId = String(socket.data.userId);
  let subscribedFriendIds = new Set();
  let lifecycleOperation = Promise.resolve();
  let subscriptionOperation = Promise.resolve();

  const queueLifecycleOperation = (operation) => {
    lifecycleOperation = lifecycleOperation
      .catch((error) => {
        console.error("Previous presence operation failed:", error);
      })
      .then(operation);
    return lifecycleOperation;
  };

  const queueSubscriptionOperation = (operation) => {
    subscriptionOperation = subscriptionOperation
      .catch((error) => {
        console.error("Previous presence subscription failed:", error);
      })
      .then(operation);
    return subscriptionOperation;
  };

  queueLifecycleOperation(async () => {
    emitTransition(userId, await connectPresence(userId, socket.id));
  }).catch((error) => console.error("Presence connection failed:", error));

  socket.on("presence:subscribe", (payload = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === "function" ? acknowledge : () => {};

    queueSubscriptionOperation(async () => {
      try {
        const requestedUserIds = parseRequestedUserIds(payload);
        const friendIds = await getAllowedFriendIds(userId, requestedUserIds);
        const nextFriendIds = new Set(friendIds.map(String));

        await Promise.all([
          ...[...subscribedFriendIds]
            .filter((friendId) => !nextFriendIds.has(friendId))
            .map((friendId) => socket.leave(watchRoom(friendId))),
          ...[...nextFriendIds]
            .filter((friendId) => !subscribedFriendIds.has(friendId))
            .map((friendId) => socket.join(watchRoom(friendId))),
        ]);
        subscribedFriendIds = nextFriendIds;

        const statuses = await getPresenceForUsers([...nextFriendIds]);
        reply({ ok: true, statuses });
      } catch (error) {
        reply({
          ok: false,
          code: error.message.startsWith("userIds must")
            ? "INVALID_PAYLOAD"
            : "INTERNAL_ERROR",
          error: error.message,
        });
      }
    }).catch((error) => console.error("Presence subscription failed:", error));
  });

  const heartbeatTimer = setInterval(() => {
    queueLifecycleOperation(async () => {
      emitTransition(userId, await refreshPresence(userId, socket.id));
    }).catch((error) => console.error("Presence refresh failed:", error));
  }, PRESENCE_HEARTBEAT_INTERVAL);
  heartbeatTimer.unref?.();

  socket.on("disconnect", () => {
    clearInterval(heartbeatTimer);
    queueLifecycleOperation(async () => {
      emitTransition(userId, await disconnectPresence(userId, socket.id));
    }).catch((error) => console.error("Presence disconnect failed:", error));
  });
};
