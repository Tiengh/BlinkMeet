import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { getRedisClient } from "../redis/redis.client.js";
import { corsOptions } from "../../shared/cors.config.js";
import { createSocketAuthMiddleware } from "./socket.auth.js";
import {
  configureMatchmakingEvents,
  registerMatchmakingSocket,
} from "../../modules/matchmaking/matchmaking.events.js";
import {
  getStatus,
  leave,
  renewMatch,
} from "../../modules/matchmaking/matchmaking.service.js";
import {
  parseOptionalCallId,
  parseSessionId,
} from "../../modules/matchmaking/matchmaking.validation.js";
import {
  configurePresenceEvents,
  emitPresenceChanged,
  registerPresenceSocket,
} from "../../modules/presence/presence.events.js";
import {
  connectPresence,
  disconnectPresence,
  findExpiredPresenceTransitions,
  getAllowedFriendIds,
  getPresenceForUsers,
  refreshPresence,
} from "../../modules/presence/presence.service.js";
import { PRESENCE_SWEEP_INTERVAL } from "../../modules/presence/presence.constants.js";

let io;
let adapterClients = [];
let presenceSweepTimer;

export const initializeWebSocketServer = async (httpServer) => {
  io = new Server(httpServer, { cors: corsOptions });

  const publisher = getRedisClient().duplicate();
  const subscriber = publisher.duplicate();
  await Promise.all([publisher.connect(), subscriber.connect()]);
  adapterClients = [publisher, subscriber];
  io.adapter(createAdapter(publisher, subscriber));

  io.use(createSocketAuthMiddleware());
  configureMatchmakingEvents(io);
  configurePresenceEvents(io);

  presenceSweepTimer = setInterval(async () => {
    try {
      const transitions = await findExpiredPresenceTransitions();
      transitions.forEach(({ userId, status, version }) => {
        emitPresenceChanged(userId, status, version);
      });
    } catch (error) {
      console.error("Presence expiration sweep failed:", error);
    }
  }, PRESENCE_SWEEP_INTERVAL);
  presenceSweepTimer.unref?.();

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    console.info("Socket connected", {
      socketId: socket.id,
      userId: socket.data.userId,
    });

    registerMatchmakingSocket(socket, {
      getStatus: (userId, sessionId) => getStatus(userId, parseSessionId(sessionId)),
      leave: (userId, sessionId, callId) =>
        leave(
          userId,
          parseSessionId(sessionId),
          parseOptionalCallId(callId),
        ),
      renewMatch,
    });
    registerPresenceSocket(socket, {
      connectPresence,
      disconnectPresence,
      getAllowedFriendIds,
      getPresenceForUsers,
      refreshPresence,
    });

    socket.on("disconnect", (reason) => {
      console.info("Socket disconnected", {
        socketId: socket.id,
        userId: socket.data.userId,
        reason,
      });
    });
  });

  return io;
};

export const closeWebSocketServer = async () => {
  if (presenceSweepTimer) {clearInterval(presenceSweepTimer);}
  presenceSweepTimer = undefined;
  if (io) {await new Promise((resolve) => io.close(resolve));}
  await Promise.all(adapterClients.map((client) =>
    client.isOpen ? client.quit() : Promise.resolve()));
  adapterClients = [];
  io = undefined;
  configurePresenceEvents(null);
};
