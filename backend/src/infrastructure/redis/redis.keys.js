import { redisConfig } from "./redis.config.js";

const prefix = `${redisConfig.keyPrefix}:{matchmaking}`;
const presencePrefix = `${redisConfig.keyPrefix}:{presence}`;

export const redisKeys = {
  waiting: `${prefix}:waiting`,
  waitingUser: (userId) => `${prefix}:user:${userId}`,
  match: (userId) => `${prefix}:match:${userId}`,
  cancelledSession: (userId, sessionId) =>
    `${prefix}:cancelled:${userId}:${sessionId}`,
  cancelledPrefix: `${prefix}:cancelled:`,
  matchPrefix: `${prefix}:match:`,
  prefix,
  presence: {
    users: `${presencePrefix}:users`,
    userSockets: (userId) => `${presencePrefix}:user:${userId}:sockets`,
    socket: (userId, socketId) =>
      `${presencePrefix}:user:${userId}:socket:${socketId}`,
    socketPrefix: (userId) => `${presencePrefix}:user:${userId}:socket:`,
    prefix: presencePrefix,
  },
};
