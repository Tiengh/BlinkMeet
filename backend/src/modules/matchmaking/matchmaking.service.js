import { randomUUID } from "node:crypto";
import { REMATCH_COOLDOWN } from "./matchmaking.constants.js";
import {
  cleanupWaitingUsers,
  getMatch,
  getWaitingUser,
  getWaitingUsers,
  isSessionCancelled,
  refreshWaitingUser,
  removeMatch,
  saveWaitingUser,
  tryCreateMatch,
} from "./matchmaking.repository.js";

const isExcluded = (user, candidate, now) =>
  (user.excludeUserId === candidate.userId && now < user.excludeUntil) ||
  (candidate.excludeUserId === user.userId && now < candidate.excludeUntil);

const generateCallId = () => `omegle-${randomUUID()}`;
const normalizeSessionId = (userId, sessionId) =>
  sessionId || `legacy-${userId}`;

const toPublicMatch = (match) => match ? ({
  status: "matched",
  callId: match.callId,
  peerId: match.peerId,
}) : null;

const getOwnedMatch = async (userId, sessionId) => {
  const match = await getMatch(userId);
  if (!match) {return { match: null, conflict: false };}
  if (match.sessionId !== sessionId) {
    return { match: null, conflict: true };
  }
  return { match: toPublicMatch(match), conflict: false };
};

const createMatch = async (userId, candidateId) => {
  const callId = generateCallId();
  return tryCreateMatch(userId, candidateId, callId);
};

const findMatch = async (userId, sessionId) => {
  const user = await getWaitingUser(userId);
  if (!user) {
    const ownedMatch = await getOwnedMatch(userId, sessionId);
    return ownedMatch.match;
  }

  if (user.sessionId !== sessionId) {
    return null;
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

    const ownedMatch = await getOwnedMatch(userId, sessionId);
    if (ownedMatch.match) {
      return ownedMatch.match;
    }
  }

  return null;
};

export const search = async (userId, excludeUserId, sessionId) => {
  sessionId = normalizeSessionId(userId, sessionId);
  await cleanupWaitingUsers();

  if (await isSessionCancelled(userId, sessionId)) {
    return { status: "cancelled" };
  }

  const existingMatch = await getOwnedMatch(userId, sessionId);
  if (existingMatch.conflict) {
    return { status: "session-conflict" };
  }
  if (existingMatch.match) {
    return existingMatch.match;
  }

  const currentWaitingUser = await getWaitingUser(userId);
  if (currentWaitingUser && currentWaitingUser.sessionId !== sessionId) {
    return { status: "session-conflict" };
  }

  const now = Date.now();
  const waitingUser = {
    userId,
    sessionId,
    excludeUserId: excludeUserId ? String(excludeUserId) : null,
    excludeUntil: excludeUserId ? now + REMATCH_COOLDOWN : 0,
    lastSeen: now,
  };

  const saved = await saveWaitingUser(userId, waitingUser);
  if (saved.status === "cancelled" || saved.status === "session-conflict") {
    return { status: saved.status };
  }
  if (saved.status === "matched") {
    const concurrentMatch = await getOwnedMatch(userId, sessionId);
    if (concurrentMatch.conflict) {
      return { status: "session-conflict" };
    }
    if (concurrentMatch.match) {
      return concurrentMatch.match;
    }
  }

  const match = await findMatch(userId, sessionId);
  if (!match) {
    const concurrentMatch = await getOwnedMatch(userId, sessionId);
    if (concurrentMatch.conflict) {
      return { status: "session-conflict" };
    }
    if (concurrentMatch.match) {
      return concurrentMatch.match;
    }
    if (await isSessionCancelled(userId, sessionId)) {
      return { status: "cancelled" };
    }
    return { status: "waiting" };
  }

  return match;
};

export const getStatus = async (userId, sessionId) => {
  sessionId = normalizeSessionId(userId, sessionId);
  await cleanupWaitingUsers();

  if (await isSessionCancelled(userId, sessionId)) {
    return { status: "cancelled" };
  }

  const existingMatch = await getOwnedMatch(userId, sessionId);
  if (existingMatch.conflict) {
    return { status: "session-conflict" };
  }
  if (existingMatch.match) {
    return existingMatch.match;
  }

  const waitingUser = await getWaitingUser(userId);
  if (!waitingUser) {
    return { status: "idle" };
  }
  if (waitingUser.sessionId !== sessionId) {
    return { status: "session-conflict" };
  }

  const refreshed = await refreshWaitingUser(userId, sessionId, Date.now());
  if (!refreshed) {
    const concurrentMatch = await getOwnedMatch(userId, sessionId);
    if (concurrentMatch.conflict) {
      return { status: "session-conflict" };
    }
    if (concurrentMatch.match) {
      return concurrentMatch.match;
    }
    if (await isSessionCancelled(userId, sessionId)) {
      return { status: "cancelled" };
    }
    return { status: "idle" };
  }

  const match = await findMatch(userId, sessionId);
  if (!match) {
    const concurrentMatch = await getOwnedMatch(userId, sessionId);
    if (concurrentMatch.conflict) {
      return { status: "session-conflict" };
    }
    if (concurrentMatch.match) {
      return concurrentMatch.match;
    }
    return { status: "waiting" };
  }

  return match;
};

export const leave = async (userId, sessionId, expectedCallId = null) => {
  sessionId = normalizeSessionId(userId, sessionId);
  const result = await removeMatch(userId, sessionId, expectedCallId);
  if (result.stale) {
    return { success: false, stale: true };
  }
  return { success: true };
};
