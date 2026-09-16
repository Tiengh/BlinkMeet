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

const createMatch = (userId, candidateId) => {
  const callId = generateCallId();
  const userMatch = { status: "matched", callId, peerId: candidateId };
  const candidateMatch = { status: "matched", callId, peerId: userId };

  saveMatch(userId, userMatch);
  saveMatch(candidateId, candidateMatch);
  return userMatch;
};

const findCandidate = (userId) => {
  const user = getWaitingUser(userId);
  if (!user) {return null;}

  const now = Date.now();
  for (const candidate of getWaitingUsers()) {
    if (candidate.userId === userId || isExcluded(user, candidate, now)) {continue;}
    return candidate;
  }

  return null;
};

export const search = (userId, excludeUserId) => {
  cleanupWaitingUsers();
  const existingMatch = getMatch(userId);
  if (existingMatch) {return existingMatch;}

  const now = Date.now();
  const waitingUser = {
    userId,
    excludeUserId: excludeUserId ? String(excludeUserId) : null,
    excludeUntil: excludeUserId ? now + REMATCH_COOLDOWN : 0,
    lastSeen: now,
  };

  saveWaitingUser(userId, waitingUser);

  const candidate = findCandidate(userId);
  if (!candidate) {return { status: "waiting" };}

  removeWaitingUser(userId);
  removeWaitingUser(candidate.userId);
  return createMatch(userId, candidate.userId);
};

export const getStatus = (userId) => {
  cleanupWaitingUsers();
  const existingMatch = getMatch(userId);
  if (existingMatch) {return existingMatch;}

  const waitingUser = getWaitingUser(userId);
  if (!waitingUser) {return { status: "idle" };}

  refreshWaitingUser(userId, Date.now());
  const candidate = findCandidate(userId);
  if (!candidate) {return { status: "waiting" };}

  removeWaitingUser(userId);
  removeWaitingUser(candidate.userId);
  return createMatch(userId, candidate.userId);
};

export const leave = (userId) => {
  removeWaitingUser(userId);
  removeMatch(userId);
  return { success: true };
};
