import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import { findUserById } from "../user/user.repository.js";
import {
  createMessage,
  findConversationById,
  findMessages,
  findMessageById,
  findOrCreateConversation,
  findPendingDeliveryMessages,
  findUnseenMessages,
  markMessageDelivered,
  markMessagesSeen,
  markPendingMessagesDelivered,
  setLastMessage,
} from "./chat.repository.js";
import {
  parseClientMessageId,
  parseHistoryLimit,
  parseMessageContent,
  parseMessageCursor,
  parseUserId,
} from "./chat.validation.js";

const publicChatUser = (user) => ({
  _id: String(user._id),
  user_name: user.user_name,
  user_profilePic: user.user_profilePic,
});

export const ensureCanChat = async (userId, targetUserId) => {
  const normalizedTargetId = parseUserId(targetUserId, "targetUserId");
  if (String(userId) === normalizedTargetId) {
    throw new BadRequestError("You cannot start a conversation with yourself");
  }

  const user = await findUserById(userId).select("user_friends");
  const target = await findUserById(normalizedTargetId)
    .select("user_name user_profilePic");
  if (!user || !target) {throw new NotFoundError("User not found");}
  if (!user.user_friends.some((friendId) => friendId.equals(normalizedTargetId))) {
    throw new ForbiddenError("You can only message friends");
  }
  return target;
};

export const getConversationHistory = async (
  userId,
  targetUserId,
  { before, limit } = {},
) => {
  const target = await ensureCanChat(userId, targetUserId);
  const conversation = await findOrCreateConversation(userId, target._id);
  const parsedLimit = parseHistoryLimit(limit);
  const messages = await findMessages(conversation._id, {
    before: parseMessageCursor(before),
    limit: parsedLimit + 1,
  });
  const hasMore = messages.length > parsedLimit;
  const page = hasMore ? messages.slice(1) : messages;

  return {
    conversation: { _id: String(conversation._id) },
    targetUser: publicChatUser(target),
    messages: page,
    nextCursor: hasMore ? String(page[0]._id) : null,
  };
};

export const sendMessage = async (
  senderId,
  { recipientId, content, clientMessageId },
) => {
  const target = await ensureCanChat(senderId, recipientId);
  const conversation = await findOrCreateConversation(senderId, target._id);
  const message = await createMessage({
    conversation: conversation._id,
    sender: senderId,
    recipient: target._id,
    content: parseMessageContent(content),
    clientMessageId: parseClientMessageId(clientMessageId),
  });
  if (String(message.conversation) !== String(conversation._id)) {
    throw new BadRequestError("clientMessageId was already used in another conversation");
  }
  await setLastMessage(conversation._id, message._id);
  return message.toObject ? message.toObject() : message;
};

export const deliverMessage = async (recipientId, messageId) => {
  parseUserId(messageId, "messageId");
  const existing = await findMessageById(messageId);
  if (!existing) {throw new NotFoundError("Message not found");}
  if (!existing.recipient.equals(recipientId)) {
    throw new ForbiddenError("You cannot update this message");
  }
  if (existing.status !== "sent") {return null;}
  return markMessageDelivered(messageId, recipientId);
};

export const deliverPendingMessages = async (recipientId) => {
  const normalizedRecipientId = parseUserId(recipientId, "recipientId");
  const pending = await findPendingDeliveryMessages(normalizedRecipientId);
  if (!pending.length) {return [];}

  const messageIds = pending.map(({ _id }) => _id);
  await markPendingMessagesDelivered(messageIds, normalizedRecipientId);

  const bySender = new Map();
  pending.forEach(({ _id, sender }) => {
    const senderId = String(sender);
    const ids = bySender.get(senderId) || [];
    ids.push(String(_id));
    bySender.set(senderId, ids);
  });

  return [...bySender.entries()].map(([senderId, deliveredMessageIds]) => ({
    senderId,
    messageIds: deliveredMessageIds,
  }));
};

export const seeConversation = async (recipientId, conversationId) => {
  parseUserId(conversationId, "conversationId");
  const conversation = await findConversationById(conversationId);
  if (!conversation) {throw new NotFoundError("Conversation not found");}
  if (!conversation.participants.some((id) => id.equals(recipientId))) {
    throw new ForbiddenError("You cannot access this conversation");
  }

  const unseen = await findUnseenMessages(conversationId, recipientId);
  if (!unseen.length) {return { messageIds: [], senderId: null };}
  await markMessagesSeen(unseen.map(({ _id }) => _id), recipientId);
  return {
    messageIds: unseen.map(({ _id }) => String(_id)),
    senderId: String(unseen[0].sender),
  };
};
