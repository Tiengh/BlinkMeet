export const redisConfig = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
  keyPrefix: process.env.REDIS_KEY_PREFIX || "blinkmeet:matchmaking",
};
