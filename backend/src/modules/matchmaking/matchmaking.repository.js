import { getRedisClient } from "../../infrastructure/redis/redis.client.js";
import { redisKeys } from "../../infrastructure/redis/redis.keys.js";
import {
  MATCH_TTL,
  SESSION_TOMBSTONE_TTL,
  WAITING_TTL,
} from "./matchmaking.constants.js";

// Queue and per-user state must change together, including across backend instances.
const saveWaitingScript = `
if redis.call('EXISTS', KEYS[4]) == 1 then return -2 end
local matchValue = redis.call('GET', KEYS[3])
if matchValue then
  local match = cjson.decode(matchValue)
  if match.sessionId == ARGV[6] then return 0 end
  return -1
end
local currentValue = redis.call('GET', KEYS[2])
if currentValue then
  local current = cjson.decode(currentValue)
  if current.sessionId ~= ARGV[6] then return -1 end
end
local ttl = tonumber(ARGV[3]) - (tonumber(ARGV[4]) - tonumber(ARGV[2]))
if ttl <= 0 then return 0 end
redis.call('SET', KEYS[2], ARGV[1], 'PX', ttl)
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]) + tonumber(ARGV[3]), ARGV[5])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

const refreshWaitingScript = `
if redis.call('EXISTS', KEYS[4]) == 1 then return false end
if redis.call('EXISTS', KEYS[3]) == 1 then return false end
local value = redis.call('GET', KEYS[2])
if not value then
  redis.call('ZREM', KEYS[1], ARGV[3])
  return false
end
local user = cjson.decode(value)
if user.sessionId ~= ARGV[4] then return false end
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
redis.call('SET', KEYS[4], cjson.encode({
  status='matched', callId=ARGV[3], peerId=ARGV[2],
  sessionId=a.sessionId, peerSessionId=b.sessionId
}), 'PX', ARGV[4])
redis.call('SET', KEYS[5], cjson.encode({
  status='matched', callId=ARGV[3], peerId=ARGV[1],
  sessionId=b.sessionId, peerSessionId=a.sessionId
}), 'PX', ARGV[4])
return cjson.encode({
  first={
    userId=ARGV[1], status='matched', callId=ARGV[3], peerId=ARGV[2],
    sessionId=a.sessionId, peerSessionId=b.sessionId
  },
  second={
    userId=ARGV[2], status='matched', callId=ARGV[3], peerId=ARGV[1],
    sessionId=b.sessionId, peerSessionId=a.sessionId
  }
})
`;

const removeSessionScript = `
local matchValue = redis.call('GET', KEYS[3])
if matchValue then
  local currentMatch = cjson.decode(matchValue)
  if currentMatch.sessionId == ARGV[3] and
     ARGV[4] ~= '' and currentMatch.callId ~= ARGV[4] then
    return cjson.encode({waitingRemoved=0, matchRemoved=0, stale=1})
  end
end

redis.call('SET', KEYS[4], '1', 'PX', ARGV[5])

local waitingRemoved = 0
local waitingValue = redis.call('GET', KEYS[2])
if waitingValue then
  local waiting = cjson.decode(waitingValue)
  if waiting.sessionId == ARGV[3] then
    redis.call('DEL', KEYS[2])
    redis.call('ZREM', KEYS[1], ARGV[2])
    waitingRemoved = 1
  end
end

local matchRemoved = 0
local peerRemoved = 0
if matchValue then
  local match = cjson.decode(matchValue)
  if match.sessionId == ARGV[3] and
     (ARGV[4] == '' or match.callId == ARGV[4]) then
    redis.call('DEL', KEYS[3])
    matchRemoved = 1

    local peerKey = ARGV[1] .. match.peerId
    local peerValue = redis.call('GET', peerKey)
    if peerValue then
      local peer = cjson.decode(peerValue)
      if peer.callId == match.callId and
         peer.peerId == ARGV[2] and
         peer.sessionId == match.peerSessionId and
         peer.peerSessionId == ARGV[3] then
        redis.call('DEL', peerKey)
        peerRemoved = 1
        local peerCancelledKey = ARGV[6] .. match.peerId .. ':' .. match.peerSessionId
        redis.call('SET', peerCancelledKey, '1', 'PX', ARGV[5])
      end
    end
  end
end

return cjson.encode({
  waitingRemoved=waitingRemoved,
  matchRemoved=matchRemoved,
  peerRemoved=peerRemoved,
  stale=0,
  callId=matchValue and cjson.decode(matchValue).callId or cjson.null,
  peerId=matchValue and cjson.decode(matchValue).peerId or cjson.null,
  peerSessionId=matchValue and cjson.decode(matchValue).peerSessionId or cjson.null
})
`;

const refreshMatchScript = `
local currentValue = redis.call('GET', KEYS[1])
if not currentValue then return false end
local current = cjson.decode(currentValue)
if current.sessionId ~= ARGV[1] or current.callId ~= ARGV[2] then return false end

local peerValue = redis.call('GET', KEYS[2])
if not peerValue then return false end
local peer = cjson.decode(peerValue)
if peer.callId ~= current.callId or peer.peerId ~= ARGV[3] or
   peer.sessionId ~= current.peerSessionId or peer.peerSessionId ~= current.sessionId then
  return false
end

redis.call('PEXPIRE', KEYS[1], ARGV[4])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return cjson.encode(current)
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

export const isSessionCancelled = (userId, sessionId) =>
  getRedisClient().exists(redisKeys.cancelledSession(userId, sessionId));

export const saveWaitingUser = async (userId, data) => {
  data = { ...data, sessionId: data.sessionId || `legacy-${userId}` };
  const result = Number(await runScript(saveWaitingScript,
    [
      redisKeys.waiting,
      redisKeys.waitingUser(userId),
      redisKeys.match(userId),
      redisKeys.cancelledSession(userId, data.sessionId),
    ],
    [
      JSON.stringify(data),
      data.lastSeen,
      WAITING_TTL,
      Date.now(),
      userId,
      data.sessionId,
    ]));

  if (result === 1) {return { status: "saved", data };}
  if (result === -1) {return { status: "session-conflict" };}
  if (result === -2) {return { status: "cancelled" };}
  return { status: "matched" };
};

export const refreshWaitingUser = async (userId, sessionId, timestamp) => {
  if (timestamp === undefined) {
    timestamp = sessionId;
    sessionId = `legacy-${userId}`;
  }
  const value = await runScript(refreshWaitingScript,
    [
      redisKeys.waiting,
      redisKeys.waitingUser(userId),
      redisKeys.match(userId),
      redisKeys.cancelledSession(userId, sessionId),
    ],
    [timestamp, WAITING_TTL, userId, sessionId]);
  return value ? JSON.parse(value) : null;
};

export const getMatch = async (userId) => {
  const value = await getRedisClient().get(redisKeys.match(userId));
  return value ? JSON.parse(value) : undefined;
};

export const tryCreateMatch = async (userId, candidateId, callId) => {
  const value = await runScript(claimScript,
    [
      redisKeys.waiting,
      redisKeys.waitingUser(userId),
      redisKeys.waitingUser(candidateId),
      redisKeys.match(userId),
      redisKeys.match(candidateId),
    ],
    [userId, candidateId, callId, MATCH_TTL, Date.now()]);
  if (!value) {return null;}
  const claimed = JSON.parse(value);
  return {
    ...claimed.first,
    matches: [claimed.first, claimed.second],
  };
};

export const refreshMatch = async (userId, sessionId, callId) => {
  const current = await getMatch(userId);
  if (!current) {return null;}
  const value = await runScript(refreshMatchScript,
    [redisKeys.match(userId), redisKeys.match(current.peerId)],
    [sessionId, callId, userId, MATCH_TTL]);
  return value ? JSON.parse(value) : null;
};

export const removeMatch = async (userId, sessionId, expectedCallId = null) => {
  const value = await runScript(removeSessionScript,
    [
      redisKeys.waiting,
      redisKeys.waitingUser(userId),
      redisKeys.match(userId),
      redisKeys.cancelledSession(userId, sessionId),
    ],
    [
      redisKeys.matchPrefix,
      userId,
      sessionId,
      expectedCallId || "",
      SESSION_TOMBSTONE_TTL,
      redisKeys.cancelledPrefix,
    ]);
  return JSON.parse(value);
};

// Tests use an isolated REDIS_KEY_PREFIX so this cannot clear application data.
export const clearAllMatchmakingState = async () => {
  const redis = getRedisClient();
  for await (const keys of redis.scanIterator({
    MATCH: `${redisKeys.prefix}:*`,
    COUNT: 100,
  })) {
    if (keys.length) {await redis.del(keys);}
  }
};
