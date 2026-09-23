import { findUserFriendIds } from "../user/user.repository.js";
import {
  getExpiredPresenceUserIds,
  getPresenceState,
  getPresenceStatuses,
  removePresenceSocket,
  touchPresenceSocket,
} from "./presence.repository.js";

const onlineTransition = async (userId, socketId) => {
  const { becameOnline, version } = await touchPresenceSocket(
    String(userId),
    socketId,
  );
  return {
    changed: becameOnline,
    status: "online",
    version,
  };
};

export const connectPresence = onlineTransition;
export const refreshPresence = onlineTransition;

export const disconnectPresence = async (userId, socketId) => {
  const { becameOffline, version } = await removePresenceSocket(
    String(userId),
    socketId,
  );
  return {
    changed: becameOffline,
    status: "offline",
    version,
  };
};

export const getAllowedFriendIds = async (userId, requestedUserIds = null) => {
  const user = await findUserFriendIds(userId);
  const friendIds = (user?.user_friends || []).map(String);
  if (requestedUserIds === null) {return friendIds;}

  const requestedIdSet = new Set(requestedUserIds.map(String));
  return friendIds.filter((friendId) => requestedIdSet.has(friendId));
};

export const getPresenceForUsers = (userIds) => getPresenceStatuses(userIds);

export const findExpiredPresenceTransitions = async () => {
  const candidateIds = await getExpiredPresenceUserIds();
  const results = await Promise.all(candidateIds.map(async (userId) => {
    const state = await getPresenceState(userId);
    if (!state.transitionedOffline) {return null;}
    return {
      userId: String(userId),
      status: "offline",
      version: state.version,
    };
  }));
  return results.filter(Boolean);
};
