import { CfnOutput, RemovalPolicy, Stack, StackProps, aws_ec2 as ec2, aws_elasticache as elasticache } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";
import { NetworkStack } from "./network-stack";

export class RedisStack extends Stack {
  readonly endpoint: string;

  constructor(scope: Construct, id: string, config: StageConfig, network: NetworkStack, props?: StackProps) {
    super(scope, id, props);
    const subnets = network.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED });
    const subnetGroup = new elasticache.CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: `${config.stage} isolated Redis subnets`,
      subnetIds: subnets.subnetIds,
    });
    const redis = new elasticache.CfnReplicationGroup(this, "Redis", {
      replicationGroupDescription: `BlinkMeet ${config.stage} shared realtime state`,
      engine: "redis",
      engineVersion: "7.1",
      cacheNodeType: config.redisNodeType,
      cacheSubnetGroupName: subnetGroup.ref,
      securityGroupIds: [network.redisSecurityGroup.securityGroupId],
      numCacheClusters: config.stage === "dev" ? 1 : 2,
      automaticFailoverEnabled: config.stage === "prod",
      multiAzEnabled: config.stage === "prod",
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      port: 6379,
      snapshotRetentionLimit: config.stage === "prod" ? 7 : 0,
    });
    redis.applyRemovalPolicy(config.stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY);
    this.endpoint = redis.attrPrimaryEndPointAddress;
    new CfnOutput(this, "RedisEndpoint", { value: this.endpoint });
  }
}
