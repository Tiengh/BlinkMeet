let socketServer;

const userRoom = (userId) => `user:${userId}`;

export const configureMatchmakingEvents = (io) => {
  socketServer = io;
};

export const emitMatchCreated = (matches) => {
  if (!socketServer) {return;}
  for (const match of matches) {
    socketServer.to(userRoom(match.userId)).emit("matchmaking:matched", {
      status: "matched",
      sessionId: match.sessionId,
      callId: match.callId,
      peerId: match.peerId,
    });
  }
};

export const emitMatchCancelled = ({
  userId,
  sessionId,
  callId,
  peerId,
  peerSessionId,
}) => {
  if (!socketServer) {return;}

  socketServer.to(userRoom(userId)).emit("matchmaking:cancelled", {
    status: "cancelled",
    sessionId,
    callId: callId || null,
  });

  if (peerId && callId) {
    socketServer.to(userRoom(peerId)).emit("call:peer-left", {
      callId,
      sessionId: peerSessionId,
      peerId: userId,
    });
  }
};

export const registerMatchmakingSocket = (socket, {
  getStatus,
  leave,
  renewMatch,
}) => {
  let lastStateSignature = null;

  const reconcile = async (sessionId) => {
    socket.data.matchmakingSessionId = sessionId;
    const state = await getStatus(socket.data.userId, sessionId);
    if (state.status === "matched") {
      await renewMatch(socket.data.userId, sessionId, state.callId);
    }
    return { ...state, sessionId };
  };

  socket.on("matchmaking:reconcile", async (payload = {}, acknowledge = () => {}) => {
    try {
      const state = await reconcile(payload.sessionId);
      lastStateSignature = JSON.stringify(state);
      acknowledge({ ok: true, state });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error.message,
        code: error.statusCode === 400 ? "INVALID_PAYLOAD" : "INTERNAL_ERROR",
      });
    }
  });

  socket.on("matchmaking:cancel", async (payload = {}, acknowledge = () => {}) => {
    try {
      const result = await leave(
        socket.data.userId,
        payload.sessionId,
        payload.callId || null,
      );
      acknowledge({ ok: !result.stale, ...result });
    } catch (error) {
      acknowledge({
        ok: false,
        error: error.message,
        code: error.statusCode === 400 ? "INVALID_PAYLOAD" : "INTERNAL_ERROR",
      });
    }
  });

  const leaseTimer = setInterval(async () => {
    const sessionId = socket.data.matchmakingSessionId;
    if (!sessionId) {return;}
    try {
      const state = await reconcile(sessionId);
      const signature = JSON.stringify(state);
      if (signature === lastStateSignature) {return;}
      lastStateSignature = signature;
      if (state.status === "matched") {
        socket.emit("matchmaking:matched", state);
      } else if (state.status === "cancelled") {
        socket.emit("matchmaking:cancelled", state);
      }
    } catch (error) {
      console.error("Matchmaking lease refresh failed:", error);
    }
  }, 10_000);
  leaseTimer.unref?.();

  socket.on("disconnect", () => clearInterval(leaseTimer));
};
