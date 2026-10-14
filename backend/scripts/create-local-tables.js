import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, waitUntilTableExists } from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT || "http://dynamodb:8000";
const region = process.env.AWS_REGION || "ap-southeast-1";
const client = new DynamoDBClient({
  endpoint, region, credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const attribute = (AttributeName) => ({ AttributeName, AttributeType: "S" });
const key = (AttributeName, KeyType) => ({ AttributeName, KeyType });
const index = (IndexName, partition, sort) => ({
  IndexName,
  KeySchema: [key(partition, "HASH"), key(sort, "RANGE")],
  Projection: { ProjectionType: "ALL" },
});
const definitions = [
  ["USERS", [attribute("_id"), attribute("recommendationBucket")], [key("_id", "HASH")],
    [index("Recommendations", "recommendationBucket", "_id")]],
  ["EMAILS", [attribute("normalizedEmail")], [key("normalizedEmail", "HASH")]],
  ["FRIEND_REQUESTS", [attribute("_id"), attribute("incomingPk"), attribute("outgoingPk"), attribute("createdAt")],
    [key("_id", "HASH")], [index("IncomingRequests", "incomingPk", "createdAt"), index("OutgoingRequests", "outgoingPk", "createdAt")]],
  ["FRIENDSHIPS", [attribute("userId"), attribute("friendId")], [key("userId", "HASH"), key("friendId", "RANGE")]],
  ["CONVERSATIONS", [attribute("_id")], [key("_id", "HASH")]],
  ["MESSAGES", [attribute("conversation"), attribute("messageKey"), attribute("recipientStatus"), attribute("conversationRecipientStatus")],
    [key("conversation", "HASH"), key("messageKey", "RANGE")],
    [index("RecipientStatus", "recipientStatus", "messageKey"),
      index("ConversationRecipientStatus", "conversationRecipientStatus", "messageKey")]],
  ["MESSAGE_KEYS", [attribute("lookupKey")], [key("lookupKey", "HASH")]],
];

for (const [suffix, AttributeDefinitions, KeySchema, GlobalSecondaryIndexes] of definitions) {
  const TableName = process.env[`DYNAMODB_TABLE_${suffix}`] || `blinkmeet-local-${suffix.replaceAll("_", "").toLowerCase()}`;
  if (!TableName) {throw new Error(`DYNAMODB_TABLE_${suffix} is required`);}
  let found = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await client.send(new DescribeTableCommand({ TableName }));
      found = true;
      break;
    } catch (error) {
      if (error.name !== "ResourceNotFoundException") {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      try {
        await client.send(new CreateTableCommand({
          TableName, AttributeDefinitions, KeySchema, GlobalSecondaryIndexes,
          BillingMode: "PAY_PER_REQUEST",
        }));
        found = true;
        break;
      } catch (createError) {
        if (createError.name === "ResourceInUseException") {found = true; break;}
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }
  if (!found) {throw new Error(`Could not create ${TableName} at ${endpoint}`);}
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName });
  console.log(`DynamoDB table ready: ${TableName}`);
}
client.destroy();
