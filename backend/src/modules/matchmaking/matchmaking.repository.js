const WAITING_TTL = 30 * 1000;
const REMATCH_COOLDOWN = 5 * 1000;
const waitingUsers = new Map();
const matches = new Map();

export const getWaitingUsers = () => [...waitingUsers.values()];
export const getWaitingUser = (userId) => waitingUsers.get(userId);
export const saveWaitingUser = (userId, data) => waitingUsers.set(userId, data);
export const refreshWaitingUser = (userId, timestamp) => {
  const user = waitingUsers.get(userId);
  if (!user) return null;

  const refreshed = { ...user, lastSeen: timestamp };
  waitingUsers.set(userId, refreshed);
  return refreshed;
};
export const removeWaitingUser = (userId) => waitingUsers.delete(userId);

export const getMatch = (userId) => matches.get(userId);
export const saveMatch = (userId, match) => matches.set(userId, match);
export const removeMatch = (userId) => {
  const match = matches.get(userId);
  matches.delete(userId);
  if (!match?.peerId) return;

  const peerMatch = matches.get(match.peerId);
  if (peerMatch?.callId === match.callId && peerMatch.peerId === userId) {
    matches.delete(match.peerId);
  }
};

export const cleanupWaitingUsers = () => {
  const now = Date.now();
  for (const [userId, user] of waitingUsers.entries()) {
    if (now - user.lastSeen > WAITING_TTL) waitingUsers.delete(userId);
  }
};

export const getRematchCooldown = () => REMATCH_COOLDOWN;