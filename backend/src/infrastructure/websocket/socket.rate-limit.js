import { consumeRateLimit } from "../redis/rate-limit.store.js";
import { securityConfig } from "../../shared/security.config.js";

const DEFAULT_EVENT_POLICY = Object.freeze({ limit: 120, windowMs: 60_000 });
const EVENT_POLICIES = Object.freeze({
  "matchmaking:reconcile": Object.freeze({ limit: 30, windowMs: 60_000 }),
  "matchmaking:cancel": Object.freeze({ limit: 20, windowMs: 60_000 }),
  "presence:subscribe": Object.freeze({ limit: 30, windowMs: 60_000 }),
  "chat:send": Object.freeze({ limit: 60, windowMs: 60_000 }),
  "chat:delivered": Object.freeze({ limit: 120, windowMs: 60_000 }),
  "chat:sync-delivered": Object.freeze({ limit: 20, windowMs: 60_000 }),
  "chat:seen": Object.freeze({ limit: 60, windowMs: 60_000 }),
  "chat:typing": Object.freeze({ limit: 180, windowMs: 60_000 }),
  "call:ready": Object.freeze({ limit: 30, windowMs: 60_000 }),
  "call:offer": Object.freeze({ limit: 30, windowMs: 60_000 }),
  "call:answer": Object.freeze({ limit: 30, windowMs: 60_000 }),
  "call:ice-candidate": Object.freeze({ limit: 300, windowMs: 60_000 }),
});

const socketError = (message, code, details = {}) => {
  const error = new Error(message);
  error.data = { code, ...details };
  return error;
};

const socketIpAddress = (socket) => String(
  socket.handshake?.address || socket.request?.socket?.remoteAddress || "unknown",
);

export const createSocketIpConnectionRateLimitMiddleware = ({
  consume = consumeRateLimit,
  policy = securityConfig.rateLimits.socketIpConnection,
} = {}) => async (socket, next) => {
  try {
    const result = await consume({
      scope: "socket:connection:ip",
      identity: socketIpAddress(socket),
      ...policy,
    });
    if (!result.allowed) {
      next(socketError("Too many socket connection attempts", "RATE_LIMITED", {
        retryAfterMs: result.retryAfterMs,
      }));
      return;
    }
    next();
  } catch {
    next(socketError("Realtime security service unavailable", "SERVICE_UNAVAILABLE"));
  }
};

export const createSocketConnectionRateLimitMiddleware = ({
  consume = consumeRateLimit,
  policy = securityConfig.rateLimits.socketConnection,
} = {}) => async (socket, next) => {
  try {
    const result = await consume({
      scope: "socket:connection",
      identity: socket.data.userId,
      ...policy,
    });
    if (!result.allowed) {
      next(socketError("Too many socket connections", "RATE_LIMITED", {
        retryAfterMs: result.retryAfterMs,
      }));
      return;
    }
    next();
  } catch {
    next(socketError("Realtime security service unavailable", "SERVICE_UNAVAILABLE"));
  }
};

export const createSocketEventRateLimitMiddleware = (socket, {
  consume = consumeRateLimit,
  policies = EVENT_POLICIES,
  defaultPolicy = DEFAULT_EVENT_POLICY,
} = {}) => async (packet, next) => {
  const [eventName] = packet;
  const policy = policies[eventName] || defaultPolicy;

  try {
    const result = await consume({
      scope: `socket:event:${eventName}`,
      identity: socket.data.userId,
      ...policy,
    });
    if (result.allowed) {
      next();
      return;
    }

    const payload = {
      ok: false,
      code: "RATE_LIMITED",
      error: "Too many realtime requests",
      retryAfterMs: result.retryAfterMs,
    };
    const acknowledge = packet.findLast((item) => typeof item === "function");
    if (acknowledge) {
      acknowledge(payload);
    } else {
      socket.emit("security:rate-limited", { event: eventName, ...payload });
    }
  } catch {
    const acknowledge = packet.findLast((item) => typeof item === "function");
    if (acknowledge) {
      acknowledge({
        ok: false,
        code: "SERVICE_UNAVAILABLE",
        error: "Realtime security service unavailable",
      });
    } else {
      socket.emit("security:error", { code: "SERVICE_UNAVAILABLE" });
    }
  }
};
