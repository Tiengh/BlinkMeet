import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import {
  acceptRequest,
  createRequest,
  deleteRequest,
  findAcceptedRequests,
  findIncomingRequests,
  findPendingOutgoingRequests,
  findRecipient,
  findRequest,
  findRequestById,
} from "./friend.repository.js";
import { areFriends } from "../user/user.repository.js";

export async function sendRequest(senderId, recipientId) {
  if (String(senderId) === String(recipientId)) {
    throw new BadRequestError("You can't send a friend request to yourself");
  }

  const recipient = await findRecipient(recipientId);
  if (!recipient) {
    throw new BadRequestError("Recipient not found");
  }

  const alreadyFriends = await areFriends(senderId, recipientId);
  if (alreadyFriends) {
    throw new BadRequestError("You are already friends with this user");
  }

  const existingRequest = await findRequest(senderId, recipientId);
  if (existingRequest) {
    throw new BadRequestError("A friend request already exists");
  }

  return { request: await createRequest(senderId, recipientId) };
}

export async function updateRequest(requestId, currentUserId, action) {
  const request = await findRequestById(requestId);
  if (!request) {
    throw new NotFoundError("Friend request not found");
  }
  if (String(request.recipient) !== String(currentUserId)) {
    throw new ForbiddenError(`You are not authorized to ${action} this request`);
  }

  if (action === "decline") {
    await deleteRequest(requestId, currentUserId);
    return {};
  }

  if (request.status === "accepted") {return {};}

  await acceptRequest(request);
  return {};
}

export async function getRequests(userId) {
  return {
    incomingReqs: await findIncomingRequests(userId),
    acceptedReqs: await findAcceptedRequests(userId),
  };
}

export const getOutgoingRequests = findPendingOutgoingRequests;
