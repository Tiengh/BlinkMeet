import { getRedisClient } from "../../infrastructure/redis/redis.client.js";
import { redisKeys } from "../../infrastructure/redis/redis.keys.js";
import { MATCH_TTL, WAITING_TTL } from "./matchmaking.constants.js";

// Queue and per-user state must change together, including across backend instances.
const saveWaitingScript = `
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
local ttl = tonumber(ARGV[3]) - (tonumber(ARGV[4]) - tonumber(ARGV[2]))
if ttl <= 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[1], 'PX', ttl)
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]) + tonumber(ARGV[3]), ARGV[5])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

const refreshWaitingScript = `
if redis.call('EXISTS', KEYS[3]) == 1 then return false end
local value = redis.call('GET', KEYS[2])
if not value then
  redis.call('ZREM', KEYS[1], ARGV[3])
  return false
end
local user = cjson.decode(value)
user.lastSeen = tonumber(ARGV[1])
redis.call('SET', KEYS[2], cjson.encode(user), 'PX', ARGV[2])
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]) + tonumber(ARGV[2]), ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return cjson.encode(user)
`;

const claimScript = `
if ARGV[1] == ARGV[2] then return 0 end
if redis.call('EXISTS', KEYS[4], KEYS[5]) > 0 then return 0 end
local first = redis.call('GET', KEYS[2])
local second = redis.call('GET', KEYS[3])
if not first or not second then
  if not first then redis.call('ZREM', KEYS[1], ARGV[1]) end
  if not second then redis.call('ZREM', KEYS[1], ARGV[2]) end
  return 0
end
local a = cjson.decode(first)
local b = cjson.decode(second)
local now = tonumber(ARGV[5])
if (a.excludeUserId == ARGV[2] and now < tonumber(a.excludeUntil)) or
   (b.excludeUserId == ARGV[1] and now < tonumber(b.excludeUntil)) then return 0 end
redis.call('DEL', KEYS[2], KEYS[3])
redis.call('ZREM', KEYS[1], ARGV[1], ARGV[2])
redis.call('SET', KEYS[4], cjson.encode({status='matched', callId=ARGV[3], peerId=ARGV[2]}), 'PX', ARGV[4])
redis.call('SET', KEYS[5], cjson.encode({status='matched', callId=ARGV[3], peerId=ARGV[1]}), 'PX', ARGV[4])
return 1
`;

const removeMatchScript = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local match = cjson.decode(value)
redis.call('DEL', KEYS[1])
local peerValue = redis.call('GET', ARGV[1] .. match.peerId)
if peerValue then
  local peer = cjson.decode(peerValue)
  if peer.callId == match.callId and peer.peerId == ARGV[2] then
    redis.call('DEL', ARGV[1] .. match.peerId)
  end
end
return 1
`;

const runScript = (script, keys, args) =>
  getRedisClient().eval(script, { keys, arguments: args.map(String) });

export const cleanupWaitingUsers = () =>
  getRedisClient().zRemRangeByScore(redisKeys.waiting, "-inf", Date.now());

export const getWaitingUsers = async () => {
  await cleanupWaitingUsers();
  const redis = getRedisClient();
  const ids = await redis.zRange(redisKeys.waiting, 0, -1);
  if (!ids.length) {return [];}
  const values = await redis.mGet(ids.map(redisKeys.waitingUser));
  return values.filter(Boolean).map(JSON.parse);
};

export const getWaitingUser = async (userId) => {
  const value = await getRedisClient().get(redisKeys.waitingUser(userId));
  return value ? JSON.parse(value) : undefined;
};

export const saveWaitingUser = async (userId, data) => {
  const saved = await runScript(saveWaitingScript,
    [redisKeys.waiting, redisKeys.waitingUser(userId), redisKeys.match(userId)],
    [JSON.stringify(data), data.lastSeen, WAITING_TTL, Date.now(), userId]);
  return saved ? data : null;
};

export const refreshWaitingUser = async (userId, timestamp) => {
  const value = await runScript(refreshWaitingScript,
    [redisKeys.waiting, redisKeys.waitingUser(userId), redisKeys.match(userId)],
    [timestamp, WAITING_TTL, userId]);
  return value ? JSON.parse(value) : null;
};

export const removeWaitingUser = async (userId) =>
  runScript("redis.call('DEL', KEYS[2]); return redis.call('ZREM', KEYS[1], ARGV[1])",
    [redisKeys.waiting, redisKeys.waitingUser(userId)], [userId]);

export const getMatch = async (userId) => {
  const value = await getRedisClient().get(redisKeys.match(userId));
  return value ? JSON.parse(value) : undefined;
};

export const tryCreateMatch = async (userId, candidateId, callId) => {
  const claimed = await runScript(claimScript,
    [redisKeys.waiting, redisKeys.waitingUser(userId), redisKeys.waitingUser(candidateId),
      redisKeys.match(userId), redisKeys.match(candidateId)],
    [userId, candidateId, callId, MATCH_TTL, Date.now()]);
  return claimed ? { status: "matched", callId, peerId: candidateId } : null;
};

export const removeMatch = async (userId) =>
  runScript(removeMatchScript, [redisKeys.match(userId)],
    [`${redisKeys.prefix}:match:`, userId]);

// Tests use an isolated REDIS_KEY_PREFIX so this cannot clear application data.
export const clearAllMatchmakingState = async () => {
  const redis = getRedisClient();
  for await (const keys of redis.scanIterator({ MATCH: `${redisKeys.prefix}:*`, COUNT: 100 })) {
    if (keys.length) {await redis.del(keys);}
  }
};
