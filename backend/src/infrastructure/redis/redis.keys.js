import { redisConfig } from "./redis.config.js";

const prefix = `${redisConfig.keyPrefix}:{matchmaking}`;

export const redisKeys = {
  waiting: `${prefix}:waiting`,
  waitingUser: (userId) => `${prefix}:user:${userId}`,
  match: (userId) => `${prefix}:match:${userId}`,
  cancelledSession: (userId, sessionId) =>
    `${prefix}:cancelled:${userId}:${sessionId}`,
  cancelledPrefix: `${prefix}:cancelled:`,
  matchPrefix: `${prefix}:match:`,
  prefix,
};
