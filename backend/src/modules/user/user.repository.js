import User from "./user.model.js";

export const findRecommendedUsers = (userId, friendIds) =>
  User.aggregate([
    { $match: { _id: { $ne: userId, $nin: friendIds }, user_isOnboarded: true } },
    { $sample: { size: 20 } },
  ]);

export const findUserFriends = (userId) =>
  User.findById(userId)
    .select("user_friends")
    .populate("user_friends", "user_name user_profilePic user_nativeLanguage user_learningLanguage");

export const findUserFriendIds = (userId) =>
  User.findById(userId).select("user_friends").lean();

export const findUserById = (userId) => User.findById(userId);
export const addFriend = (userId, friendId) =>
  User.findByIdAndUpdate(userId, { $addToSet: { user_friends: friendId } });
