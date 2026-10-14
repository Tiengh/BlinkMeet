import { BatchGetCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamo, getTable } from "../../infrastructure/database/dynamodb.js";

const publicUser = (user) => {
  if (!user) {return null;}
  const result = { ...user };
  delete result.user_password;
  delete result.recommendationBucket;
  return result;
};

export const getUserRecord = async (userId) =>
  (await getDynamo().send(new GetCommand({
    TableName: getTable("users"), Key: { _id: String(userId) }, ConsistentRead: true,
  }))).Item || null;

export const findUserById = async (userId) => publicUser(await getUserRecord(userId));

const listFriendEdges = async (userId) => {
  const edges = [];
  let cursor;
  do {
    const page = await getDynamo().send(new QueryCommand({
      TableName: getTable("friendships"),
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": String(userId) },
      ExclusiveStartKey: cursor,
      ConsistentRead: true,
    }));
    edges.push(...(page.Items || []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return edges;
};

export const findUserFriendIds = async (userId) => ({
  user_friends: (await listFriendEdges(userId)).map((edge) => edge.friendId),
});

export const areFriends = async (userId, friendId) => Boolean((await getDynamo().send(new GetCommand({
  TableName: getTable("friendships"),
  Key: { userId: String(userId), friendId: String(friendId) },
  ConsistentRead: true,
}))).Item);

const batchUsers = async (ids) => {
  const result = [];
  let keys = ids.map((_id) => ({ _id: String(_id) }));
  let retry = 0;
  while (keys.length) {
    const page = await getDynamo().send(new BatchGetCommand({
      RequestItems: { [getTable("users")]: { Keys: keys.slice(0, 100) } },
    }));
    result.push(...(page.Responses?.[getTable("users")] || []));
    const unprocessed = page.UnprocessedKeys?.[getTable("users")]?.Keys || [];
    keys = [...keys.slice(100), ...unprocessed];
    if (unprocessed.length) {
      retry += 1;
      if (retry > 8) {throw new Error("DynamoDB could not read all friend profiles");}
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** retry));
    } else {
      retry = 0;
    }
  }
  return result.map(publicUser);
};

export const findUserFriends = async (userId) => {
  const user = await findUserById(userId);
  if (!user) {return null;}
  const ids = (await listFriendEdges(userId)).map((edge) => edge.friendId);
  const users = await batchUsers(ids);
  const byId = new Map(users.map((friend) => [friend._id, friend]));
  return { user_friends: ids.map((id) => byId.get(id)).filter(Boolean) };
};

export const findRecommendedUsers = async (userId) => {
  const friends = new Set((await findUserFriendIds(userId)).user_friends);
  friends.add(String(userId));
  const buckets = Array.from({ length: 16 }, (_, index) => index)
    .sort(() => Math.random() - 0.5);
  const result = [];
  for (const bucket of buckets) {
    let cursor;
    let pages = 0;
    do {
      const page = await getDynamo().send(new QueryCommand({
        TableName: getTable("users"), IndexName: "Recommendations",
        KeyConditionExpression: "recommendationBucket = :bucket",
        ExpressionAttributeValues: { ":bucket": String(bucket) },
        Limit: 40, ExclusiveStartKey: cursor,
      }));
      result.push(...(page.Items || []).filter((user) => !friends.has(user._id)).map(publicUser));
      cursor = page.LastEvaluatedKey;
      pages += 1;
    } while (cursor && pages < 2 && result.length < 20);
    if (result.length >= 20) {break;}
  }
  return result.slice(0, 20);
};
