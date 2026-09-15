import { randomUUID } from "node:crypto";

const WAITING_TTL = 30 * 1000;
const REMATCH_COOLDOWN = 5 * 1000;

const waitingUsers = new Map();
const matches = new Map();

const cleanupExpiredUsers = () => {
  const now = Date.now();

  for (const [userId, user] of waitingUsers.entries()) {
    if (now - user.lastSeen > WAITING_TTL) {
      waitingUsers.delete(userId);
    }
  }
};

const removeMatch = (userId) => {
  const match = matches.get(userId);

  matches.delete(userId);

  if (!match?.peerId) {
    return;
  }

  const peerMatch = matches.get(match.peerId);

  if (
    peerMatch &&
    peerMatch.callId === match.callId &&
    peerMatch.peerId === userId
  ) {
    matches.delete(match.peerId);
  }
};

const isExcluded = (user, candidate, now) => {
  const userExcludesCandidate =
    user.excludeUserId === candidate.userId &&
    now < user.excludeUntil;

  const candidateExcludesUser =
    candidate.excludeUserId === user.userId &&
    now < candidate.excludeUntil;

  return userExcludesCandidate || candidateExcludesUser;
};

const tryMatchUser = (userId) => {
  const user = waitingUsers.get(userId);

  if (!user) {
    return null;
  }

  const now = Date.now();

  for (const candidate of waitingUsers.values()) {
    if (candidate.userId === userId) {
      continue;
    }

    if (isExcluded(user, candidate, now)) {
      continue;
    }

    const callId = `omegle-${randomUUID()}`;

    waitingUsers.delete(userId);
    waitingUsers.delete(candidate.userId);

    const userMatch = {
      status: "matched",
      callId,
      peerId: candidate.userId,
    };

    const candidateMatch = {
      status: "matched",
      callId,
      peerId: userId,
    };

    matches.set(userId, userMatch);
    matches.set(candidate.userId, candidateMatch);

    return userMatch;
  }

  return null;
};

export const searchRandomCall = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const excludeUserId = req.body?.excludeUserId
      ? String(req.body.excludeUserId)
      : null;

    cleanupExpiredUsers();

    const existingMatch = matches.get(userId);

    if (existingMatch) {
      return res.status(200).json(existingMatch);
    }

    const now = Date.now();

    waitingUsers.set(userId, {
      userId,
      excludeUserId,
      excludeUntil: excludeUserId
        ? now + REMATCH_COOLDOWN
        : 0,
      lastSeen: now,
    });

    const match = tryMatchUser(userId);

    if (match) {
      return res.status(200).json(match);
    }

    return res.status(200).json({
      status: "waiting",
    });
  } catch (error) {
    console.error("searchRandomCall error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getRandomCallStatus = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    cleanupExpiredUsers();

    const existingMatch = matches.get(userId);

    if (existingMatch) {
      return res.status(200).json(existingMatch);
    }

    const waitingUser = waitingUsers.get(userId);

    if (!waitingUser) {
      return res.status(200).json({
        status: "idle",
      });
    }

    waitingUser.lastSeen = Date.now();

    const match = tryMatchUser(userId);

    if (match) {
      return res.status(200).json(match);
    }

    return res.status(200).json({
      status: "waiting",
    });
  } catch (error) {
    console.error("getRandomCallStatus error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const leaveRandomCall = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    waitingUsers.delete(userId);

    removeMatch(userId);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("leaveRandomCall error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};