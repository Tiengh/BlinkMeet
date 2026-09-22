import { findUserFriendIds } from "../user/user.repository.js";
import {
  getExpiredPresenceUserIds,
  getPresenceStatus,
  getPresenceStatuses,
  removePresenceSocket,
  touchPresenceSocket,
} from "./presence.repository.js";

export const connectPresence = (userId, socketId) =>
  touchPresenceSocket(String(userId), socketId);

export const refreshPresence = (userId, socketId) =>
  touchPresenceSocket(String(userId), socketId);

export const disconnectPresence = (userId, socketId) =>
  removePresenceSocket(String(userId), socketId);

export const getFriendPresence = async (userId, requestedUserIds = null) => {
  const user = await findUserFriendIds(userId);
  const friendIds = (user?.user_friends || []).map(String);
  const requestedIdSet = requestedUserIds
    ? new Set(requestedUserIds.map(String))
    : null;
  const allowedIds = requestedUserIds
    ? friendIds.filter((friendId) => requestedIdSet.has(friendId))
    : friendIds;

  return {
    friendIds: allowedIds,
    statuses: await getPresenceStatuses(allowedIds),
  };
};

export const findExpiredOfflineUsers = async () => {
  const candidateIds = await getExpiredPresenceUserIds();
  const results = await Promise.all(candidateIds.map(async (userId) => ({
    userId,
    isOnline: await getPresenceStatus(userId),
  })));
  return results.filter(({ isOnline }) => !isOnline).map(({ userId }) => userId);
};
