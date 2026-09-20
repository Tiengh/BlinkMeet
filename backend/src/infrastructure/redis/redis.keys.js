import { redisConfig } from "./redis.config.js";

const prefix = redisConfig.keyPrefix;

export const redisKeys = {
  waiting: `${prefix}:waiting`,
  waitingUser: (userId) => `${prefix}:user:${userId}`,
  match: (userId) => `${prefix}:match:${userId}`,
  prefix,
};
