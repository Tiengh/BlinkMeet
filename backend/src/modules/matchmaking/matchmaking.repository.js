import { MATCH_TTL, WAITING_TTL } from "./matchmaking.constants.js";

const waitingUsers = new Map();
const matches = new Map();
const matchExpirations = new Map();

const saveMatch = (userId, match, expiresAt) => {
  matches.set(userId, match);
  matchExpirations.set(userId, expiresAt);
};

export const getWaitingUsers = () => [...waitingUsers.values()];
export const getWaitingUser = (userId) => waitingUsers.get(userId);
export const saveWaitingUser = (userId, data) => {
  if (getMatch(userId)) {
    return null;
  }

  waitingUsers.set(userId, data);
  return data;
};
export const refreshWaitingUser = (userId, timestamp) => {
  const user = waitingUsers.get(userId);
  if (!user) {return null;}

  const refreshed = { ...user, lastSeen: timestamp };
  waitingUsers.set(userId, refreshed);
  return refreshed;
};
export const removeWaitingUser = (userId) => waitingUsers.delete(userId);

export const removeMatch = (userId) => {
  const match = matches.get(userId);
  matches.delete(userId);
  matchExpirations.delete(userId);
  if (!match?.peerId) {return;}

  const peerMatch = matches.get(match.peerId);
  if (peerMatch?.callId === match.callId && peerMatch.peerId === userId) {
    matches.delete(match.peerId);
    matchExpirations.delete(match.peerId);
  }
};

export const getMatch = (userId) => {
  const expiresAt = matchExpirations.get(userId);
  if (expiresAt && expiresAt <= Date.now()) {
    removeMatch(userId);
    return undefined;
  }

  return matches.get(userId);
};

export const tryCreateMatch = (userId, candidateId, callId) => {
  if (
    userId === candidateId ||
    !waitingUsers.has(userId) ||
    !waitingUsers.has(candidateId) ||
    getMatch(userId) ||
    getMatch(candidateId)
  ) {
    return null;
  }

  const expiresAt = Date.now() + MATCH_TTL;
  const userMatch = { status: "matched", callId, peerId: candidateId };
  const candidateMatch = { status: "matched", callId, peerId: userId };

  waitingUsers.delete(userId);
  waitingUsers.delete(candidateId);
  saveMatch(userId, userMatch, expiresAt);
  saveMatch(candidateId, candidateMatch, expiresAt);

  return userMatch;
};

export const cleanupWaitingUsers = () => {
  const now = Date.now();
  for (const [userId, user] of waitingUsers.entries()) {
    if (now - user.lastSeen > WAITING_TTL) {waitingUsers.delete(userId);}
  }
};

export const clearAllMatchmakingState = () => {
  waitingUsers.clear();
  matches.clear();
  matchExpirations.clear();
};
