import { getRedisClient } from "../../infrastructure/redis/redis.client.js";
import { redisKeys } from "../../infrastructure/redis/redis.keys.js";
import { PRESENCE_TTL } from "./presence.constants.js";

const touchSocketScript = `
local socketIds = redis.call('SMEMBERS', KEYS[1])
local activeBefore = 0
for _, socketId in ipairs(socketIds) do
  if redis.call('EXISTS', ARGV[1] .. socketId) == 1 then
    activeBefore = activeBefore + 1
  else
    redis.call('SREM', KEYS[1], socketId)
  end
end

redis.call('SET', KEYS[2], '1', 'PX', ARGV[5])
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[5]) * 2)
redis.call('ZADD', KEYS[3], 'GT', tonumber(ARGV[4]) + tonumber(ARGV[5]), ARGV[3])

if activeBefore == 0 then return 1 end
return 0
`;

const removeSocketScript = `
redis.call('DEL', KEYS[2])
redis.call('SREM', KEYS[1], ARGV[2])

local socketIds = redis.call('SMEMBERS', KEYS[1])
local active = 0
local maxTtl = 0
for _, socketId in ipairs(socketIds) do
  local ttl = redis.call('PTTL', ARGV[1] .. socketId)
  if ttl > 0 then
    active = active + 1
    if ttl > maxTtl then maxTtl = ttl end
  else
    redis.call('SREM', KEYS[1], socketId)
  end
end

if active == 0 then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[3], ARGV[3])
  return 1
end

redis.call('PEXPIRE', KEYS[1], maxTtl + tonumber(ARGV[4]))
redis.call('ZADD', KEYS[3], tonumber(ARGV[5]) + maxTtl, ARGV[3])
return 0
`;

const getStatusScript = `
local socketIds = redis.call('SMEMBERS', KEYS[1])
local active = 0
local maxTtl = 0
for _, socketId in ipairs(socketIds) do
  local ttl = redis.call('PTTL', ARGV[1] .. socketId)
  if ttl > 0 then
    active = active + 1
    if ttl > maxTtl then maxTtl = ttl end
  else
    redis.call('SREM', KEYS[1], socketId)
  end
end

if active == 0 then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[2], ARGV[2])
  return 0
end

redis.call('PEXPIRE', KEYS[1], maxTtl + tonumber(ARGV[3]))
redis.call('ZADD', KEYS[2], tonumber(ARGV[4]) + maxTtl, ARGV[2])
return active
`;

const runScript = (script, keys, args) =>
  getRedisClient().eval(script, { keys, arguments: args.map(String) });

export const touchPresenceSocket = async (
  userId,
  socketId,
  now = Date.now(),
) => {
  const becameOnline = await runScript(
    touchSocketScript,
    [
      redisKeys.presence.userSockets(userId),
      redisKeys.presence.socket(userId, socketId),
      redisKeys.presence.users,
    ],
    [
      redisKeys.presence.socketPrefix(userId),
      socketId,
      userId,
      now,
      PRESENCE_TTL,
    ],
  );
  return Number(becameOnline) === 1;
};

export const removePresenceSocket = async (
  userId,
  socketId,
  now = Date.now(),
) => {
  const becameOffline = await runScript(
    removeSocketScript,
    [
      redisKeys.presence.userSockets(userId),
      redisKeys.presence.socket(userId, socketId),
      redisKeys.presence.users,
    ],
    [
      redisKeys.presence.socketPrefix(userId),
      socketId,
      userId,
      PRESENCE_TTL,
      now,
    ],
  );
  return Number(becameOffline) === 1;
};

export const getPresenceStatus = async (userId, now = Date.now()) => {
  const activeSockets = await runScript(
    getStatusScript,
    [redisKeys.presence.userSockets(userId), redisKeys.presence.users],
    [
      redisKeys.presence.socketPrefix(userId),
      userId,
      PRESENCE_TTL,
      now,
    ],
  );
  return Number(activeSockets) > 0;
};

export const getPresenceStatuses = async (userIds) => {
  const uniqueIds = [...new Set(userIds.map(String))];
  const statuses = await Promise.all(
    uniqueIds.map(async (userId) => [userId, await getPresenceStatus(userId)]),
  );
  return Object.fromEntries(
    statuses.map(([userId, isOnline]) => [
      userId,
      { status: isOnline ? "online" : "offline" },
    ]),
  );
};

export const getExpiredPresenceUserIds = (now = Date.now()) =>
  getRedisClient().zRangeByScore(redisKeys.presence.users, "-inf", now);

// Tests use an isolated REDIS_KEY_PREFIX so this cannot clear application data.
export const clearAllPresenceState = async () => {
  const redis = getRedisClient();
  for await (const keys of redis.scanIterator({
    MATCH: `${redisKeys.presence.prefix}:*`,
    COUNT: 100,
  })) {
    if (keys.length) {await redis.del(keys);}
  }
};
