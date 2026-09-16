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
    return { error: { status: 400, message: "You can't send a friend request to yourself" } };
  }

  const recipient = await findRecipient(recipientId);
  if (!recipient) return { error: { status: 400, message: "Recipient not found" } };
  if (recipient.user_friends.includes(senderId)) {
    return { error: { status: 400, message: "You are already friends with this user" } };
  }
  if (await findRequest(senderId, recipientId)) {
    return { error: { status: 400, message: "A friend request already exists" } };
  }

  return { request: await createRequest(senderId, recipientId) };
}

export async function updateRequest(requestId, currentUserId, action) {
  const request = await findRequestById(requestId);
  if (!request) return { error: { status: 404, message: "Friend request not found" } };
  if (!request.recipient.equals(currentUserId)) {
    return { error: { status: 403, message: `You are not authorized to ${action} this request` } };
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