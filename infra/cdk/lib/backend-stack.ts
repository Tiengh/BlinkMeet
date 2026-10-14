import {
  CfnOutput, Duration, RemovalPolicy, Stack, StackProps,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";
import { NetworkStack } from "./network-stack";
import { RedisStack } from "./redis-stack";
import { DynamoDbStack } from "./dynamodb-stack";

export class BackendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    config: StageConfig,
    network: NetworkStack,
    redis: RedisStack,
    dynamo: DynamoDbStack,
    repository: ecr.IRepository,
    props?: StackProps,
  ) {
    super(scope, id, props);
    const cluster = new ecs.Cluster(this, "Cluster", { vpc: network.vpc });
    const logGroup = new logs.LogGroup(this, "BackendLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: config.stage === "dev" ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });
    const task = new ecs.FargateTaskDefinition(this, "BackendTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });
    const fromSecret = (name: string, arn: string) => ecs.Secret.fromSecretsManager(
      secretsmanager.Secret.fromSecretCompleteArn(this, name, arn),
    );
    const secrets: Record<string, ecs.Secret> = {
      JWT_SECRET_KEY: fromSecret("JwtSecret", config.jwtSecretArn),
    };
    if (config.streamApiSecretArn) {
      secrets.STREAM_API_SECRET = fromSecret("StreamSecret", config.streamApiSecretArn);
    }
    if (config.turnSecretArn) {
      secrets.TURN_SHARED_SECRET = fromSecret("TurnSecret", config.turnSecretArn);
    }
    const environment: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "3000",
      TRUST_PROXY: "1",
      CLIENT_ORIGIN: config.frontendDomain ? `https://${config.frontendDomain}` : "https://example.invalid",
      COOKIE_SAME_SITE: "lax",
      REDIS_URL: `rediss://${redis.endpoint}:6379`,
      REDIS_KEY_PREFIX: `blinkmeet:${config.stage}`,
      AWS_REGION: config.region,
      WEBRTC_ICE_TRANSPORT_POLICY: "all",
    };
    for (const [name, table] of Object.entries(dynamo.tables)) {
      environment[`DYNAMODB_TABLE_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`] = table.tableName;
    }
    const grant = (name: string, actions: string[]) => task.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: actions.map((action) => `dynamodb:${action}`),
        resources: [dynamo.tables[name].tableArn],
      }),
    );
    grant("users", ["GetItem", "BatchGetItem", "PutItem", "UpdateItem", "DescribeTable", "TransactWriteItems"]);
    grant("emails", ["GetItem", "PutItem", "TransactWriteItems"]);
    grant("friendRequests", ["GetItem", "Query", "PutItem", "UpdateItem", "DeleteItem", "TransactWriteItems"]);
    grant("friendships", ["GetItem", "Query", "PutItem", "ConditionCheckItem", "TransactWriteItems"]);
    grant("conversations", ["GetItem", "PutItem", "UpdateItem"]);
    grant("messages", ["GetItem", "Query", "PutItem", "UpdateItem", "TransactWriteItems"]);
    grant("messageKeys", ["GetItem", "PutItem", "TransactWriteItems"]);
    for (const name of ["users", "friendRequests", "messages"]) {
      task.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [`${dynamo.tables[name].tableArn}/index/*`],
      }));
    }
    if (config.streamApiKey) environment.STREAM_API_KEY = config.streamApiKey;
    if (config.turnUrls) {
      environment.WEBRTC_TURN_URLS = config.turnUrls;
      environment.TURN_EXTERNAL_IP = config.turnExternalIp!;
    }
    const container = task.addContainer("Backend", {
      image: ecs.ContainerImage.fromEcrRepository(repository, config.imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "backend", logGroup }),
      environment,
      secrets,
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });
    container.addPortMappings({ containerPort: 3000 });
    const service = new ecs.FargateService(this, "BackendService", {
      cluster,
      taskDefinition: task,
      desiredCount: config.desiredCount,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [network.backendSecurityGroup],
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(120),
      minHealthyPercent: 100,
    });
    const alb = new elbv2.ApplicationLoadBalancer(this, "ApiAlb", {
      vpc: network.vpc,
      internetFacing: Boolean(config.apiDomain),
      vpcSubnets: { subnetType: config.apiDomain ? ec2.SubnetType.PUBLIC : ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: network.albSecurityGroup,
    });
    alb.setAttribute("idle_timeout.timeout_seconds", "120");
    const listener = config.apiDomain ? alb.addListener("HttpsListener", {
      port: 443,
      certificates: [acm.Certificate.fromCertificateArn(this, "ApiCertificate", config.apiCertificateArn)],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    }) : alb.addListener("InternalHttpListener", { port: 80 });
    const targetGroup = listener.addTargets("BackendTargets", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/api/health/ready",
        healthyHttpCodes: "200",
        interval: Duration.seconds(30),
        unhealthyThresholdCount: 3,
      },
    });
    new CfnOutput(this, "AlbDnsName", { value: alb.loadBalancerDnsName });
    new CfnOutput(this, "ApiUrl", { value: config.apiDomain ? `https://${config.apiDomain}` : `http://${alb.loadBalancerDnsName}` });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.serviceName });
    new CfnOutput(this, "TargetGroupArn", { value: targetGroup.targetGroupArn });
  }
}
