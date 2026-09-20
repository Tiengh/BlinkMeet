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
  saveWaitingUser,
  tryCreateMatch,
} from "./matchmaking.repository.js";

const isExcluded = (user, candidate, now) =>
  (user.excludeUserId === candidate.userId && now < user.excludeUntil) ||
  (candidate.excludeUserId === user.userId && now < candidate.excludeUntil);

const generateCallId = () => `omegle-${randomUUID()}`;

const createMatch = async (userId, candidateId) => {
  const callId = generateCallId();
  return tryCreateMatch(userId, candidateId, callId);
};

const findMatch = async (userId) => {
  const user = await getWaitingUser(userId);
  if (!user) {
    return getMatch(userId);
  }

  const now = Date.now();
  const waitingUsers = await getWaitingUsers();
  for (const candidate of waitingUsers) {
    if (candidate.userId === userId || isExcluded(user, candidate, now)) {
      continue;
    }

    const match = await createMatch(userId, candidate.userId);
    if (match) {
      return match;
    }

    const existingMatch = await getMatch(userId);
    if (existingMatch) {
      return existingMatch;
    }
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

  const match = await findMatch(userId);
  if (!match) {
    const concurrentMatch = await getMatch(userId);
    if (concurrentMatch) {return concurrentMatch;}
    return { status: "waiting" };
  }

  return match;
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
  const match = await findMatch(userId);
  if (!match) {
    const concurrentMatch = await getMatch(userId);
    if (concurrentMatch) {return concurrentMatch;}
    return { status: "waiting" };
  }

  return match;
};

export const leave = async (userId) => {
  await removeWaitingUser(userId);
  await removeMatch(userId);
  return { success: true };
};
