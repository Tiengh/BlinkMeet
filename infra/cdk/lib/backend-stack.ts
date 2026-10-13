import {
  CfnOutput, Duration, RemovalPolicy, Stack, StackProps,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { StageConfig } from "../config/stage";
import { NetworkStack } from "./network-stack";
import { RedisStack } from "./redis-stack";

export class BackendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    config: StageConfig,
    network: NetworkStack,
    redis: RedisStack,
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
      MONGO_URL: fromSecret("MongoSecret", config.mongoSecretArn),
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
      CLIENT_ORIGIN: `https://${config.frontendDomain}`,
      COOKIE_SAME_SITE: "lax",
      REDIS_URL: `rediss://${redis.endpoint}:6379`,
      REDIS_KEY_PREFIX: `blinkmeet:${config.stage}`,
      WEBRTC_ICE_TRANSPORT_POLICY: "all",
    };
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
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: network.albSecurityGroup,
    });
    alb.setAttribute("idle_timeout.timeout_seconds", "120");
    const listener = alb.addListener("HttpsListener", {
      port: 443,
      certificates: [acm.Certificate.fromCertificateArn(this, "ApiCertificate", config.apiCertificateArn)],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });
    listener.addTargets("BackendTargets", {
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
    new CfnOutput(this, "ApiUrl", { value: `https://${config.apiDomain}` });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.serviceName });
  }
}
