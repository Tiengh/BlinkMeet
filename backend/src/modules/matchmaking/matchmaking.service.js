import { randomUUID } from "node:crypto";
import { REMATCH_COOLDOWN } from "./matchmaking.constants.js";
import {
  cleanupWaitingUsers,
  getMatch,
  getWaitingUser,
  getWaitingUsers,
  refreshWaitingUser,
  removeMatch,
  removeWaitingUser,
  saveMatch,
  saveWaitingUser,
} from "./matchmaking.repository.js";

const isExcluded = (user, candidate, now) =>
  (user.excludeUserId === candidate.userId && now < user.excludeUntil) ||
  (candidate.excludeUserId === user.userId && now < candidate.excludeUntil);

const generateCallId = () => `omegle-${randomUUID()}`;

const createMatch = async (userId, candidateId) => {
  const callId = generateCallId();
  const userMatch = { status: "matched", callId, peerId: candidateId };
  const candidateMatch = { status: "matched", callId, peerId: userId };

  await saveMatch(userId, userMatch);
  await saveMatch(candidateId, candidateMatch);
  return userMatch;
};

const findCandidate = async (userId) => {
  const user = await getWaitingUser(userId);
  if (!user) {
    return null;
  }

  const now = Date.now();
  const waitingUsers = await getWaitingUsers();
  for (const candidate of waitingUsers) {
    if (candidate.userId === userId || isExcluded(user, candidate, now)) {
      continue;
    }
    return candidate;
  }

  return null;
};

export const search = async (userId, excludeUserId) => {
  await cleanupWaitingUsers();
  const existingMatch = await getMatch(userId);
  if (existingMatch) {
    return existingMatch;
  }

  const now = Date.now();
  const waitingUser = {
    userId,
    excludeUserId: excludeUserId ? String(excludeUserId) : null,
    excludeUntil: excludeUserId ? now + REMATCH_COOLDOWN : 0,
    lastSeen: now,
  };

  await saveWaitingUser(userId, waitingUser);

  const candidate = await findCandidate(userId);
  if (!candidate) {
    return { status: "waiting" };
  }

  await removeWaitingUser(userId);
  await removeWaitingUser(candidate.userId);
  return createMatch(userId, candidate.userId);
};

export const getStatus = async (userId) => {
  await cleanupWaitingUsers();
  const existingMatch = await getMatch(userId);
  if (existingMatch) {
    return existingMatch;
  }

  const waitingUser = await getWaitingUser(userId);
  if (!waitingUser) {
    return { status: "idle" };
  }

  await refreshWaitingUser(userId, Date.now());
  const candidate = await findCandidate(userId);
  if (!candidate) {
    return { status: "waiting" };
  }

  await removeWaitingUser(userId);
  await removeWaitingUser(candidate.userId);
  return createMatch(userId, candidate.userId);
};

export const leave = async (userId) => {
  await removeWaitingUser(userId);
  await removeMatch(userId);
  return { success: true };
};
