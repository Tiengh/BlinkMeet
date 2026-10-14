import { findRecommendedUsers, findUserFriends } from "./user.repository.js";

export const getRecommendedUsers = (user) => findRecommendedUsers(user._id);
export const getFriends = (userId) => findUserFriends(userId);
