import FriendRequest from "./friend-request.model.js";
import { addFriend, findUserById } from "../user/user.repository.js";

export const findRecipient = findUserById;
export const findRequest = (sender, recipient) =>
  FriendRequest.findOne({ sender, recipient });
export const createRequest = (sender, recipient) =>
  FriendRequest.create({ sender, recipient });
export const findRequestById = (requestId) => FriendRequest.findById(requestId);
export const deleteRequest = (requestId) => FriendRequest.findByIdAndDelete(requestId);
export const addUserFriend = addFriend;
export const findIncomingRequests = (userId) =>
  FriendRequest.find({ recipient: userId, status: "pending" }).populate(
    "sender",
    "user_name user_profilePic user_nativeLanguage user_learningLanguage"
  );
export const findAcceptedRequests = (userId) =>
  FriendRequest.find({ sender: userId, status: "accepted" }).populate(
    "recipient",
    "user_name user_profilePic user_nativeLanguage"
  );
export const findPendingOutgoingRequests = (userId) =>
  FriendRequest.find({ sender: userId, status: "pending" }).populate(
    "recipient",
    "user_name user_profilePic user_nativeLanguage user_learningLanguage user_location"
  );