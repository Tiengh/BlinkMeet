import { CfnOutput, RemovalPolicy, Stack, StackProps, aws_dynamodb as dynamodb } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";

export class DynamoDbStack extends Stack {
  readonly tables: Record<string, dynamodb.Table>;

  constructor(scope: Construct, id: string, config: StageConfig, props?: StackProps) {
    super(scope, id, props);
    const create = (name: string, partitionKey: string, sortKey?: string) =>
      new dynamodb.Table(this, name, {
        tableName: `blinkmeet-${config.stage}-${name.toLowerCase()}`,
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        ...(sortKey ? { sortKey: { name: sortKey, type: dynamodb.AttributeType.STRING } } : {}),
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        pointInTimeRecoverySpecification: {
          pointInTimeRecoveryEnabled: config.stage === "prod",
        },
        deletionProtection: config.stage === "prod",
        removalPolicy: config.stage === "dev" ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      });

    this.tables = {
      users: create("Users", "_id"),
      emails: create("Emails", "normalizedEmail"),
      friendRequests: create("FriendRequests", "_id"),
      friendships: create("Friendships", "userId", "friendId"),
      conversations: create("Conversations", "_id"),
      messages: create("Messages", "conversation", "messageKey"),
      messageKeys: create("MessageKeys", "lookupKey"),
    };
    this.tables.users.addGlobalSecondaryIndex({
      indexName: "Recommendations",
      partitionKey: { name: "recommendationBucket", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "_id", type: dynamodb.AttributeType.STRING },
    });
    this.tables.friendRequests.addGlobalSecondaryIndex({
      indexName: "IncomingRequests",
      partitionKey: { name: "incomingPk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    this.tables.friendRequests.addGlobalSecondaryIndex({
      indexName: "OutgoingRequests",
      partitionKey: { name: "outgoingPk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });
    this.tables.messages.addGlobalSecondaryIndex({
      indexName: "RecipientStatus",
      partitionKey: { name: "recipientStatus", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "messageKey", type: dynamodb.AttributeType.STRING },
    });
    this.tables.messages.addGlobalSecondaryIndex({
      indexName: "ConversationRecipientStatus",
      partitionKey: { name: "conversationRecipientStatus", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "messageKey", type: dynamodb.AttributeType.STRING },
    });
    for (const [name, table] of Object.entries(this.tables)) {
      new CfnOutput(this, `${name}TableName`, { value: table.tableName });
    }
  }
}
