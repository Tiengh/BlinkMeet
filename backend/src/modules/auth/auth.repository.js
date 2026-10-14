import { randomBytes } from "node:crypto";
import { GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTable, isConditionalFailure } from "../../infrastructure/database/dynamodb.js";
import { getUserRecord, findUserById } from "../user/user.repository.js";
import { BadRequestError } from "../../shared/errors/bad-request.error.js";

export const findUserByEmail = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const mapping = (await getDynamo().send(new GetCommand({
    TableName: getTable("emails"), Key: { normalizedEmail }, ConsistentRead: true,
  }))).Item;
  return mapping ? getUserRecord(mapping.userId) : null;
};

export const createUser = async (data) => {
  const now = new Date().toISOString();
  const user = {
    _id: randomBytes(12).toString("hex"),
    ...data,
    user_email: data.user_email.trim().toLowerCase(),
    user_bio: "", user_nativeLanguage: "", user_learningLanguage: "",
    user_location: "", user_isOnboarded: false,
    createdAt: now, updatedAt: now,
  };
  try {
    await getDynamo().send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: getTable("users"), Item: user, ConditionExpression: "attribute_not_exists(#id)", ExpressionAttributeNames: { "#id": "_id" } } },
      { Put: { TableName: getTable("emails"), Item: { normalizedEmail: user.user_email, userId: user._id }, ConditionExpression: "attribute_not_exists(normalizedEmail)" } },
    ] }));
  } catch (error) {
    if (isConditionalFailure(error)) {throw new BadRequestError("Already existed, use a different email");}
    throw error;
  }
  return user;
};

export const updateUser = async (userId, data) => {
  const keys = Object.keys(data);
  const values = Object.fromEntries(keys.map((key, index) => [`:v${index}`, data[key]]));
  const names = Object.fromEntries(keys.map((key, index) => [`#k${index}`, key]));
  try {
    await getDynamo().send(new UpdateCommand({
      TableName: getTable("users"), Key: { _id: String(userId) },
      UpdateExpression: `SET ${keys.map((_, index) => `#k${index} = :v${index}`).join(", ")}, updatedAt = :now, recommendationBucket = :bucket`,
      ConditionExpression: "attribute_exists(#id)",
      ExpressionAttributeNames: { ...names, "#id": "_id" },
      ExpressionAttributeValues: {
        ...values, ":now": new Date().toISOString(),
        ":bucket": String(Math.floor(Math.random() * 16)),
      },
    }));
  } catch (error) {
    if (isConditionalFailure(error)) {return null;}
    throw error;
  }
  return findUserById(userId);
};
