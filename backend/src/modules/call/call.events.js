import { CALL_EVENTS } from "./call.constants.js";
import { authorizeCallSignal } from "./call.service.js";
import {
  parseCallIdentity,
  parseDescription,
  parseIceCandidate,
} from "./call.validation.js";

let socketServer;

const userRoom = (userId) => `user:${userId}`;
const safeReply = (acknowledge) =>
  typeof acknowledge === "function" ? acknowledge : () => {};

export const configureCallEvents = (io) => {
  socketServer = io;
};

export const registerCallSocket = (socket, dependencies = {}) => {
  const authorize = dependencies.authorizeCallSignal || authorizeCallSignal;
  const userId = String(socket.data.userId);

  const registerRelay = (event, parsePayload, selectPayload) => {
    socket.on(event, async (payload = {}, acknowledge = () => {}) => {
      const reply = safeReply(acknowledge);
      try {
        const parsed = parsePayload(payload);
        await authorize(userId, parsed);
        socketServer?.to(userRoom(parsed.peerId)).emit(event, {
          callId: parsed.callId,
          fromUserId: userId,
          ...selectPayload(parsed),
        });
        reply({ ok: true });
      } catch (error) {
        reply({
          ok: false,
          code: error?.statusCode ? "SIGNAL_REJECTED" : "INTERNAL_ERROR",
          error: error?.statusCode ? error.message : "Call signaling failed",
        });
      }
    });
  };

  registerRelay(CALL_EVENTS.READY, parseCallIdentity, () => ({}));
  registerRelay(
    CALL_EVENTS.OFFER,
    (payload) => parseDescription(payload, "offer"),
    ({ description }) => ({ description }),
  );
  registerRelay(
    CALL_EVENTS.ANSWER,
    (payload) => parseDescription(payload, "answer"),
    ({ description }) => ({ description }),
  );
  registerRelay(
    CALL_EVENTS.ICE_CANDIDATE,
    parseIceCandidate,
    ({ candidate }) => ({ candidate }),
  );
};
