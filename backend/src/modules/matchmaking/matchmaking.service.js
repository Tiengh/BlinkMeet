import {
  cleanupWaitingUsers,
  findMatch,
  getMatch,
  getRematchCooldown,
  getWaitingUser,
  removeMatch,
  removeWaitingUser,
  touchWaitingUser,
} from "./matchmaking.repository.js";

export const search = (userId, excludeUserId) => {
  cleanupWaitingUsers();
  const existingMatch = getMatch(userId);
  if (existingMatch) return existingMatch;

  const now = Date.now();
  touchWaitingUser(userId, {
    userId,
    excludeUserId: excludeUserId ? String(excludeUserId) : null,
    excludeUntil: excludeUserId ? now + getRematchCooldown() : 0,
    lastSeen: now,
  });

  return findMatch(userId) || { status: "waiting" };
};

export const getStatus = (userId) => {
  cleanupWaitingUsers();
  const existingMatch = getMatch(userId);
  if (existingMatch) return existingMatch;

  const waitingUser = getWaitingUser(userId);
  if (!waitingUser) return { status: "idle" };
  waitingUser.lastSeen = Date.now();
  return findMatch(userId) || { status: "waiting" };
};

export const leave = (userId) => {
  removeWaitingUser(userId);
  removeMatch(userId);
  return { success: true };
};