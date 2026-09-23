import Conversation from "./conversation.model.js";
import Message from "./message.model.js";

export const buildParticipantKey = (userA, userB) =>
  [String(userA), String(userB)].sort().join(":");

export const findConversationByParticipants = (userA, userB) =>
  Conversation.findOne({ participantKey: buildParticipantKey(userA, userB) });

export const createConversation = (userA, userB) =>
  Conversation.create({
    participants: [userA, userB],
    participantKey: buildParticipantKey(userA, userB),
  });

export const findOrCreateConversation = async (userA, userB) => {
  const existing = await findConversationByParticipants(userA, userB);
  if (existing) {return existing;}

  try {
    return await createConversation(userA, userB);
  } catch (error) {
    if (error?.code !== 11000) {throw error;}
    return findConversationByParticipants(userA, userB);
  }
};

export const findConversationById = (conversationId) =>
  Conversation.findById(conversationId);

export const findMessageByClientId = (senderId, clientMessageId) =>
  clientMessageId
    ? Message.findOne({ sender: senderId, clientMessageId })
    : null;

export const createMessage = async (messageData) => {
  try {
    return await Message.create(messageData);
  } catch (error) {
    if (error?.code !== 11000 || !messageData.clientMessageId) {throw error;}
    return findMessageByClientId(messageData.sender, messageData.clientMessageId);
  }
};

export const setLastMessage = (conversationId, messageId) =>
  Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: messageId,
    updatedAt: new Date(),
  });

export const findMessages = async (conversationId, { before, limit }) => {
  const filter = { conversation: conversationId };
  if (before) {filter._id = { $lt: before };}
  const messages = await Message.find(filter).sort({ _id: -1 }).limit(limit).lean();
  return messages.reverse();
};

export const findMessageById = (messageId) => Message.findById(messageId);

export const markMessageDelivered = (messageId, recipientId) =>
  Message.findOneAndUpdate(
    { _id: messageId, recipient: recipientId, status: "sent" },
    { status: "delivered" },
    { new: true },
  );

export const findUnseenMessages = (conversationId, recipientId) =>
  Message.find({
    conversation: conversationId,
    recipient: recipientId,
    status: { $in: ["sent", "delivered"] },
  }).select("_id sender").lean();

export const markMessagesSeen = (messageIds, recipientId) =>
  Message.updateMany(
    { _id: { $in: messageIds }, recipient: recipientId },
    { status: "seen" },
  );
