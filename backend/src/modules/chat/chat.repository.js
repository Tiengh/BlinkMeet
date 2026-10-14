import { createHash, randomBytes } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTable, isConditionalFailure } from "../../infrastructure/database/dynamodb.js";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";

export const buildParticipantKey = (userA, userB) =>
  [String(userA), String(userB)].sort().join(":");

const conversationIdFor = (a, b) => createHash("sha256")
  .update(buildParticipantKey(a, b)).digest("hex").slice(0, 24);

const publicMessage = (message) => {
  if (!message) {return null;}
  const result = { ...message };
  delete result.messageKey;
  delete result.recipientStatus;
  delete result.conversationRecipientStatus;
  return result;
};

export const findConversationByParticipants = (a, b) =>
  findConversationById(conversationIdFor(a, b));

export const findConversationById = async (conversationId) =>
  (await getDynamo().send(new GetCommand({
    TableName: getTable("conversations"), Key: { _id: String(conversationId) }, ConsistentRead: true,
  }))).Item || null;

export const findOrCreateConversation = async (a, b) => {
  const existing = await findConversationByParticipants(a, b);
  if (existing) {return existing;}
  const now = new Date().toISOString();
  const conversation = {
    _id: conversationIdFor(a, b), participants: [String(a), String(b)],
    participantKey: buildParticipantKey(a, b), createdAt: now, updatedAt: now,
  };
  try {
    await getDynamo().send(new PutCommand({
      TableName: getTable("conversations"), Item: conversation,
      ConditionExpression: "attribute_not_exists(#id)", ExpressionAttributeNames: { "#id": "_id" },
    }));
    return conversation;
  } catch (error) {
    if (!isConditionalFailure(error)) {throw error;}
    return findConversationByParticipants(a, b);
  }
};

const getMessageLocation = async (lookupKey) =>
  (await getDynamo().send(new GetCommand({
    TableName: getTable("messageKeys"), Key: { lookupKey }, ConsistentRead: true,
  }))).Item;

const getMessageAt = async (location) => {
  if (!location) {return null;}
  const message = (await getDynamo().send(new GetCommand({
    TableName: getTable("messages"),
    Key: { conversation: location.conversation, messageKey: location.messageKey },
    ConsistentRead: true,
  }))).Item;
  return publicMessage(message);
};

export const findMessageById = async (messageId) =>
  getMessageAt(await getMessageLocation(`MSG#${messageId}`));

export const findMessageByClientId = async (sender, clientMessageId) =>
  getMessageAt(await getMessageLocation(`CLIENT#${sender}#${clientMessageId}`));

export const createMessage = async (data) => {
  const now = new Date().toISOString();
  const id = randomBytes(12).toString("hex");
  const message = {
    ...data,
    _id: id, conversation: String(data.conversation), sender: String(data.sender),
    recipient: String(data.recipient),
    messageKey: `${String(Date.now()).padStart(13, "0")}#${id}`,
    status: "sent", createdAt: now, updatedAt: now,
    recipientStatus: `${data.recipient}#sent`,
    conversationRecipientStatus: `${data.conversation}#${data.recipient}#sent`,
  };
  const location = { conversation: message.conversation, messageKey: message.messageKey };
  const puts = [
    { TableName: getTable("messages"), Item: message,
      ConditionExpression: "attribute_not_exists(conversation)" },
    { TableName: getTable("messageKeys"), Item: { lookupKey: `MSG#${id}`, ...location },
      ConditionExpression: "attribute_not_exists(lookupKey)" },
  ];
  if (data.clientMessageId) {
    puts.push({ TableName: getTable("messageKeys"),
      Item: { lookupKey: `CLIENT#${data.sender}#${data.clientMessageId}`, ...location },
      ConditionExpression: "attribute_not_exists(lookupKey)" });
  }
  try {
    await getDynamo().send(new TransactWriteCommand({
      TransactItems: puts.map((put) => ({ Put: put })),
    }));
    return publicMessage(message);
  } catch (error) {
    if (!data.clientMessageId || !isConditionalFailure(error)) {throw error;}
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await findMessageByClientId(data.sender, data.clientMessageId);
      if (existing) {return existing;}
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
    throw error;
  }
};

export const setLastMessage = async (conversationId, messageId) => {
  const location = await getMessageLocation(`MSG#${messageId}`);
  if (!location || location.conversation !== String(conversationId)) {return;}
  try {
    await getDynamo().send(new UpdateCommand({
      TableName: getTable("conversations"), Key: { _id: String(conversationId) },
      UpdateExpression: "SET lastMessage = :message, lastMessageKey = :key, updatedAt = :now",
      ConditionExpression: "attribute_exists(#id) AND (attribute_not_exists(lastMessageKey) OR lastMessageKey < :key)",
      ExpressionAttributeNames: { "#id": "_id" },
      ExpressionAttributeValues: {
        ":message": String(messageId), ":key": location.messageKey,
        ":now": new Date().toISOString(),
      },
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) {throw error;}
  }
};

const encodeCursor = (conversation, messageKey) =>
  Buffer.from(JSON.stringify({ v: 1, conversation, messageKey })).toString("base64url");

const decodeCursor = (cursor, conversation) => {
  if (!cursor) {return undefined;}
  let parsed;
  try {parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));}
  catch {throw new BadRequestError("before cursor is invalid");}
  if (parsed?.v !== 1 || parsed.conversation !== String(conversation) ||
      typeof parsed.messageKey !== "string" || !/^\d{13}#[a-f\d]{24}$/i.test(parsed.messageKey)) {
    throw new BadRequestError("before cursor is invalid");
  }
  return { conversation: String(conversation), messageKey: parsed.messageKey };
};

export const findMessages = async (conversationId, { before, limit }) => {
  const page = await getDynamo().send(new QueryCommand({
    TableName: getTable("messages"),
    KeyConditionExpression: "conversation = :conversation",
    ExpressionAttributeValues: { ":conversation": String(conversationId) },
    ScanIndexForward: false, Limit: limit + 1,
    ConsistentRead: true,
    ExclusiveStartKey: decodeCursor(before, conversationId),
  }));
  const hasMore = (page.Items || []).length > limit;
  const selected = (page.Items || []).slice(0, limit);
  return {
    messages: selected.map(publicMessage).reverse(),
    nextCursor: hasMore ? encodeCursor(String(conversationId), selected.at(-1).messageKey) : null,
  };
};

const updateStatus = async (message, recipientId, from, to) => {
  try {
    const isSeen = to === "seen";
    const updated = await getDynamo().send(new UpdateCommand({
      TableName: getTable("messages"),
      Key: { conversation: message.conversation, messageKey: message.messageKey },
      UpdateExpression: isSeen
        ? "SET #status = :to, updatedAt = :now REMOVE recipientStatus, conversationRecipientStatus"
        : "SET #status = :to, recipientStatus = :recipientStatus, conversationRecipientStatus = :conversationStatus, updatedAt = :now",
      ConditionExpression: "recipient = :recipient AND #status = :from",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":recipient": String(recipientId), ":from": from, ":to": to,
        ...(!isSeen ? {
          ":recipientStatus": `${recipientId}#${to}`,
          ":conversationStatus": `${message.conversation}#${recipientId}#${to}`,
        } : {}),
        ":now": new Date().toISOString(),
      }, ReturnValues: "ALL_NEW",
    }));
    return publicMessage(updated.Attributes);
  } catch (error) {
    if (isConditionalFailure(error)) {return null;}
    throw error;
  }
};

export const markMessageDelivered = async (messageId, recipientId) => {
  const location = await getMessageLocation(`MSG#${messageId}`);
  return location ? updateStatus(location, recipientId, "sent", "delivered") : null;
};

const decodeStatusCursor = (cursor, value, attribute) => {
  if (!cursor) {return undefined;}
  if (typeof cursor !== "string" || cursor.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new BadRequestError("status cursor is invalid");
  }
  let parsed;
  try {parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));}
  catch {throw new BadRequestError("status cursor is invalid");}
  const key = parsed?.key;
  if (parsed?.value !== value || !key || key[attribute] !== value ||
      typeof key.conversation !== "string" ||
      !/^\d{13}#[a-f\d]{24}$/i.test(key.messageKey)) {
    throw new BadRequestError("status cursor is invalid");
  }
  return key;
};

const queryStatus = async (index, attribute, value, cursor = null) => {
  const page = await getDynamo().send(new QueryCommand({
    TableName: getTable("messages"), IndexName: index,
    KeyConditionExpression: `${attribute} = :value`,
    ExpressionAttributeValues: { ":value": value }, Limit: 200,
    ExclusiveStartKey: decodeStatusCursor(cursor, value, attribute),
  }));
  return {
    messages: (page.Items || []).map(publicMessage),
    nextCursor: page.LastEvaluatedKey
      ? Buffer.from(JSON.stringify({ value, key: page.LastEvaluatedKey })).toString("base64url")
      : null,
  };
};

export const findPendingDeliveryMessages = (recipientId, cursor = null) =>
  queryStatus("RecipientStatus", "recipientStatus", `${recipientId}#sent`, cursor);

export const markPendingMessagesDelivered = async (messages, recipientId) => {
  const delivered = [];
  for (let index = 0; index < messages.length; index += 20) {
    delivered.push(...(await Promise.all(messages.slice(index, index + 20).map((message) =>
      markMessageDelivered(message._id, recipientId)))).filter(Boolean));
  }
  return delivered;
};

export const findUnseenMessages = async (conversationId, recipientId, cursor = null) => {
  let phase = "sent";
  let pageCursor = null;
  if (cursor) {
    if (typeof cursor !== "string" || cursor.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new BadRequestError("status cursor is invalid");
    }
    let parsed;
    try {parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));}
    catch {throw new BadRequestError("status cursor is invalid");}
    if (parsed?.conversation !== String(conversationId) ||
        parsed?.recipient !== String(recipientId) ||
        !["sent", "delivered"].includes(parsed.phase) ||
        (parsed.pageCursor !== null && typeof parsed.pageCursor !== "string")) {
      throw new BadRequestError("status cursor is invalid");
    }
    phase = parsed.phase;
    pageCursor = parsed.pageCursor;
  }
  const page = await queryStatus("ConversationRecipientStatus", "conversationRecipientStatus",
    `${conversationId}#${recipientId}#${phase}`, pageCursor);
  const nextPhase = page.nextCursor ? phase : phase === "sent" ? "delivered" : null;
  const nextCursor = nextPhase ? Buffer.from(JSON.stringify({
    conversation: String(conversationId), recipient: String(recipientId),
    phase: nextPhase, pageCursor: page.nextCursor,
  })).toString("base64url") : null;
  return { messages: page.messages, nextCursor };
};

export const markMessagesSeen = async (messages, recipientId) => {
  const seen = [];
  for (let index = 0; index < messages.length; index += 20) {
    seen.push(...(await Promise.all(messages.slice(index, index + 20).map(async (message) => {
      const location = await getMessageLocation(`MSG#${message._id}`);
      return location ? updateStatus(location, recipientId, message.status, "seen") : null;
    }))).filter(Boolean));
  }
  return seen;
};
