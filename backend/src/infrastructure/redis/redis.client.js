import { createClient } from "redis";
import { redisConfig } from "./redis.config.js";

let client;

export const getRedisClient = () => {
  if (!client) {
    client = createClient({ url: redisConfig.url });
    client.on("error", (error) => console.error("Redis error:", error));
  }
  return client;
};

export const connectRedis = async () => {
  const redis = getRedisClient();
  if (!redis.isOpen) {await redis.connect();}
  return redis;
};
