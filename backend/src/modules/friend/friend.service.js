import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import {
  addUserFriend,
  createRequest,
  deleteRequest,
  findAcceptedRequests,
  findIncomingRequests,
  findPendingOutgoingRequests,
  findRecipient,
  findRequest,
  findRequestById,
} from "./friend.repository.js";

export async function sendRequest(senderId, recipientId) {
  if (senderId.equals(recipientId)) {
    throw new BadRequestError("You can't send a friend request to yourself");
  }

  const recipient = await findRecipient(recipientId);
  if (!recipient) {throw new BadRequestError("Recipient not found");}

  const alreadyFriends = recipient.user_friends.some((friendId) => friendId.equals(senderId));
  if (alreadyFriends) {
    throw new BadRequestError("You are already friends with this user");
  }

  const existingRequest = await findRequest(senderId, recipientId);
  const reverseRequest = await findRequest(recipientId, senderId);
  if (existingRequest || reverseRequest) {
    throw new BadRequestError("A friend request already exists");
  }

  return { request: await createRequest(senderId, recipientId) };
}

export async function updateRequest(requestId, currentUserId, action) {
  const request = await findRequestById(requestId);
  if (!request) {throw new NotFoundError("Friend request not found");}
  if (!request.recipient.equals(currentUserId)) {
    throw new ForbiddenError(`You are not authorized to ${action} this request`);
  }

  if (action === "decline") {
    await deleteRequest(requestId);
    return {};
  }

  request.status = "accepted";
  await request.save();
  await addUserFriend(request.sender, request.recipient);
  await addUserFriend(request.recipient, request.sender);
  return {};
}

export async function getRequests(userId) {
  return {
    incomingReqs: await findIncomingRequests(userId),
    acceptedReqs: await findAcceptedRequests(userId),
  };
}

export const getOutgoingRequests = findPendingOutgoingRequests;
