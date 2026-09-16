import { randomUUID } from "node:crypto";

const WAITING_TTL = 30 * 1000;
const REMATCH_COOLDOWN = 5 * 1000;
const waitingUsers = new Map();
const matches = new Map();

const cleanupExpiredUsers = () => {
  const now = Date.now();
  for (const [userId, user] of waitingUsers.entries()) {
    if (now - user.lastSeen > WAITING_TTL) waitingUsers.delete(userId);
  }
};

const isExcluded = (user, candidate, now) =>
  (user.excludeUserId === candidate.userId && now < user.excludeUntil) ||
  (candidate.excludeUserId === user.userId && now < candidate.excludeUntil);

export const getMatch = (userId) => matches.get(userId);
export const getWaitingUser = (userId) => waitingUsers.get(userId);
export const touchWaitingUser = (userId, data) => waitingUsers.set(userId, data);
export const removeWaitingUser = (userId) => waitingUsers.delete(userId);
export const cleanupWaitingUsers = cleanupExpiredUsers;

export const findMatch = (userId) => {
  const user = waitingUsers.get(userId);
  if (!user) return null;

  const now = Date.now();
  for (const candidate of waitingUsers.values()) {
    if (candidate.userId === userId || isExcluded(user, candidate, now)) continue;

    const callId = `omegle-${randomUUID()}`;
    waitingUsers.delete(userId);
    waitingUsers.delete(candidate.userId);

    const userMatch = { status: "matched", callId, peerId: candidate.userId };
    const candidateMatch = { status: "matched", callId, peerId: userId };
    matches.set(userId, userMatch);
    matches.set(candidate.userId, candidateMatch);
    return userMatch;
  }
  return null;
};

export const removeMatch = (userId) => {
  const match = matches.get(userId);
  matches.delete(userId);
  if (!match?.peerId) return;

  const peerMatch = matches.get(match.peerId);
  if (peerMatch?.callId === match.callId && peerMatch.peerId === userId) {
    matches.delete(match.peerId);
  }
};

export const getRematchCooldown = () => REMATCH_COOLDOWN;