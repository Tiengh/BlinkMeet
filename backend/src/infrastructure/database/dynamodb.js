import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const tableNames = ["users", "emails", "friendRequests", "friendships", "conversations", "messages", "messageKeys"];

let client;
let rawClient;
export const getDynamo = () => {
  if (!client) {
    const endpoint = process.env.DYNAMODB_ENDPOINT;
    const region = process.env.AWS_REGION || "ap-southeast-1";
    rawClient = new DynamoDBClient({
      region,
      ...(endpoint ? {
        endpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      } : {}),
      maxAttempts: 3,
    });
    client = DynamoDBDocumentClient.from(rawClient, { marshallOptions: { removeUndefinedValues: true } });
  }
  return client;
};

export const getTable = (name) => {
  if (!tableNames.includes(name)) {throw new Error(`Unknown DynamoDB table ${name}`);}
  const key = `DYNAMODB_TABLE_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
  const table = process.env[key] || (process.env.DYNAMODB_ENDPOINT ? `blinkmeet-local-${name.toLowerCase()}` : "");
  if (!table) {throw new Error(`DYNAMODB_TABLE_${name} is required`);}
  return table;
};

export const isConditionalFailure = (error) =>
  error?.name === "ConditionalCheckFailedException" ||
  error?.name === "TransactionCanceledException" &&
    error.CancellationReasons?.some((reason) => reason.Code === "ConditionalCheckFailed");

export const checkDynamoReady = async () => {
  const table = getTable("users");
  getDynamo();
  await rawClient.send(new DescribeTableCommand({ TableName: table }), {
    abortSignal: AbortSignal.timeout(3_000),
  });
};

export const closeDynamo = () => {
  rawClient?.destroy();
  rawClient = undefined;
  client = undefined;
};
