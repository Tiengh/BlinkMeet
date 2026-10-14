import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { ForbiddenError } from "../../shared/errors/forbidden.error.js";
import { NotFoundError } from "../../shared/errors/not-found.error.js";
import { areFriends, findUserById } from "../user/user.repository.js";
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

  const [user, target] = await Promise.all([
    findUserById(userId), findUserById(normalizedTargetId),
  ]);
  if (!user || !target) {throw new NotFoundError("User not found");}
  if (!(await areFriends(userId, normalizedTargetId))) {
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
  const { messages, nextCursor } = await findMessages(conversation._id, {
    before: parseMessageCursor(before),
    limit: parsedLimit,
  });

  return {
    conversation: { _id: String(conversation._id) },
    targetUser: publicChatUser(target),
    messages,
    nextCursor,
  };
};

// A committed message remains successful even if conversation metadata update fails.
export const updateLastMessageBestEffort = async (conversationId, messageId, update = setLastMessage) => {
  try {
    await update(conversationId, messageId);
  } catch (error) {
    console.error("Conversation lastMessage update failed", {
      conversationId, messageId, error: error?.message || String(error),
    });
  }
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
  await updateLastMessageBestEffort(conversation._id, message._id);
  return message;
};

export const deliverMessage = async (recipientId, messageId) => {
  parseUserId(messageId, "messageId");
  const existing = await findMessageById(messageId);
  if (!existing) {throw new NotFoundError("Message not found");}
  if (String(existing.recipient) !== String(recipientId)) {
    throw new ForbiddenError("You cannot update this message");
  }
  if (existing.status !== "sent") {return null;}
  return markMessageDelivered(messageId, recipientId);
};

export const deliverPendingMessages = async (recipientId, cursor = null) => {
  const normalizedRecipientId = parseUserId(recipientId, "recipientId");
  const pending = await findPendingDeliveryMessages(normalizedRecipientId, cursor);
  if (!pending.messages.length) {return { deliveries: [], nextCursor: pending.nextCursor };}

  const delivered = await markPendingMessagesDelivered(pending.messages, normalizedRecipientId);

  const bySender = new Map();
  delivered.forEach(({ _id, sender }) => {
    const senderId = String(sender);
    const ids = bySender.get(senderId) || [];
    ids.push(String(_id));
    bySender.set(senderId, ids);
  });

  return {
    deliveries: [...bySender.entries()].map(([senderId, deliveredMessageIds]) => ({
      senderId, messageIds: deliveredMessageIds,
    })),
    nextCursor: pending.nextCursor,
  };
};

export const seeConversation = async (recipientId, conversationId, cursor = null) => {
  parseUserId(conversationId, "conversationId");
  const conversation = await findConversationById(conversationId);
  if (!conversation) {throw new NotFoundError("Conversation not found");}
  if (!conversation.participants.some((id) => String(id) === String(recipientId))) {
    throw new ForbiddenError("You cannot access this conversation");
  }

  const unseen = await findUnseenMessages(conversationId, recipientId, cursor);
  if (!unseen.messages.length) {
    return { messageIds: [], senderId: null, nextCursor: unseen.nextCursor };
  }
  const seen = await markMessagesSeen(unseen.messages, recipientId);
  return {
    messageIds: seen.map(({ _id }) => String(_id)),
    senderId: seen.length ? String(seen[0].sender) : null,
    nextCursor: unseen.nextCursor,
  };
};
