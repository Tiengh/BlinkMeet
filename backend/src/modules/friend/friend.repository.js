import { createHash } from "node:crypto";
import { DeleteCommand, GetCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTable, isConditionalFailure } from "../../infrastructure/database/dynamodb.js";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";
import { findUserById } from "../user/user.repository.js";
import { toUserPreview } from "../user/user.mapper.js";

const requestIdFor = (a, b) => createHash("sha256")
  .update([String(a), String(b)].sort().join(":"))
  .digest("hex").slice(0, 24);

export const findRecipient = findUserById;
export const findRequest = async (sender, recipient) =>
  findRequestById(requestIdFor(sender, recipient));

export const createRequest = async (sender, recipient) => {
  const now = new Date().toISOString();
  const request = {
    _id: requestIdFor(sender, recipient),
    sender: String(sender), recipient: String(recipient), status: "pending",
    incomingPk: `${recipient}#pending`, outgoingPk: `${sender}#pending`,
    createdAt: now, updatedAt: now,
  };
  try {
    await getDynamo().send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: getTable("friendRequests"), Item: request,
        ConditionExpression: "attribute_not_exists(#id)", ExpressionAttributeNames: { "#id": "_id" } } },
      { ConditionCheck: { TableName: getTable("friendships"),
        Key: { userId: String(sender), friendId: String(recipient) },
        ConditionExpression: "attribute_not_exists(userId)" } },
    ] }));
  } catch (error) {
    if (isConditionalFailure(error)) {throw new BadRequestError("A friend request already exists");}
    throw error;
  }
  return request;
};

export const findRequestById = async (requestId) =>
  (await getDynamo().send(new GetCommand({
    TableName: getTable("friendRequests"), Key: { _id: String(requestId) }, ConsistentRead: true,
  }))).Item || null;

export const deleteRequest = async (requestId, recipientId) => {
  try {
    await getDynamo().send(new DeleteCommand({
      TableName: getTable("friendRequests"), Key: { _id: String(requestId) },
      ConditionExpression: "recipient = :recipient AND #status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":recipient": String(recipientId), ":pending": "pending" },
    }));
  } catch (error) {
    if (isConditionalFailure(error)) {throw new BadRequestError("Request is no longer pending");}
    throw error;
  }
};

export const acceptRequest = async (request) => {
  const now = new Date().toISOString();
  try {
    await getDynamo().send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: getTable("friendRequests"), Key: { _id: request._id },
        UpdateExpression: "SET #status = :accepted, outgoingPk = :outgoing, updatedAt = :now REMOVE incomingPk",
        ConditionExpression: "#status = :pending AND recipient = :recipient AND sender = :sender",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":accepted": "accepted", ":pending": "pending",
          ":outgoing": `${request.sender}#accepted`, ":now": now,
          ":recipient": request.recipient, ":sender": request.sender } } },
      ...[[request.sender, request.recipient], [request.recipient, request.sender]].map(([userId, friendId]) => ({
        Put: { TableName: getTable("friendships"), Item: { userId, friendId, createdAt: now },
          ConditionExpression: "attribute_not_exists(userId)" },
      })),
    ] }));
  } catch (error) {
    if (isConditionalFailure(error)) {throw new BadRequestError("Request is no longer pending");}
    throw error;
  }
};

const listRequests = async (index, pk) => {
  const requests = [];
  let cursor;
  do {
    const page = await getDynamo().send(new QueryCommand({
      TableName: getTable("friendRequests"), IndexName: index,
      KeyConditionExpression: `${index === "IncomingRequests" ? "incomingPk" : "outgoingPk"} = :pk`,
      ExpressionAttributeValues: { ":pk": pk }, ExclusiveStartKey: cursor,
    }));
    requests.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return Promise.all(requests.map(async (request) => ({
    ...request,
    [index === "IncomingRequests" ? "sender" : "recipient"]:
      toUserPreview(await findUserById(index === "IncomingRequests" ? request.sender : request.recipient)),
  })));
};

export const findIncomingRequests = (userId) => listRequests("IncomingRequests", `${userId}#pending`);
export const findAcceptedRequests = (userId) => listRequests("OutgoingRequests", `${userId}#accepted`);
export const findPendingOutgoingRequests = (userId) => listRequests("OutgoingRequests", `${userId}#pending`);
