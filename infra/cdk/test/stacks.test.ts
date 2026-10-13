import assert from "node:assert/strict";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { loadStageConfig } from "../config/stage";
import { NetworkStack } from "../lib/network-stack";
import { RedisStack } from "../lib/redis-stack";
import { RegistryStack } from "../lib/registry-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { BackendStack } from "../lib/backend-stack";

const env = {
  BLINKMEET_DEV_ACCOUNT_ID: "123456789012",
  BLINKMEET_DEV_REGION: "ap-southeast-1",
  BLINKMEET_DEV_AZS: "ap-southeast-1a,ap-southeast-1b",
  BLINKMEET_DEV_IMAGE_TAG: "git-abcdef123456",
  BLINKMEET_DEV_API_DOMAIN: "api.dev.example.com",
  BLINKMEET_DEV_FRONTEND_DOMAIN: "app.dev.example.com",
  BLINKMEET_DEV_API_CERTIFICATE_ARN: "arn:aws:acm:ap-southeast-1:123456789012:certificate/api",
  BLINKMEET_DEV_FRONTEND_CERTIFICATE_ARN: "arn:aws:acm:us-east-1:123456789012:certificate/frontend",
  BLINKMEET_DEV_MONGO_SECRET_ARN: "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:mongo-AbCdEf",
  BLINKMEET_DEV_JWT_SECRET_ARN: "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:jwt-AbCdEf",
};

test("stage config rejects unsafe deployment targets and mutable image tags", () => {
  assert.throws(() => loadStageConfig("staging", env), /stage must be dev or prod/);
  assert.throws(() => loadStageConfig("dev", { ...env, BLINKMEET_DEV_IMAGE_TAG: "latest" }), /immutable/);
  assert.throws(() => loadStageConfig("dev", { ...env, BLINKMEET_DEV_FRONTEND_DOMAIN: "other.example.org" }), /sibling/);
});

test("dev infrastructure isolates Redis and ECS, uses TLS and private CloudFront origin", () => {
  const config = loadStageConfig("dev", env);
  const app = new App();
  const props = { env: { account: config.account, region: config.region } };
  const network = new NetworkStack(app, "BlinkMeetDevNetwork", config, props);
  const registry = new RegistryStack(app, "BlinkMeetDevRegistry", config, props);
  const redis = new RedisStack(app, "BlinkMeetDevRedis", config, network, props);
  const frontend = new FrontendStack(app, "BlinkMeetDevFrontend", config, props);
  const backend = new BackendStack(app, "BlinkMeetDevBackend", config, network, redis, registry.repository, props);

  const networkTemplate = Template.fromStack(network);
  networkTemplate.resourceCountIs("AWS::EC2::NatGateway", 1);
  networkTemplate.resourceCountIs("AWS::EC2::Subnet", 6);
  const redisTemplate = Template.fromStack(redis);
  redisTemplate.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
    TransitEncryptionEnabled: true,
    AtRestEncryptionEnabled: true,
    NumCacheClusters: 1,
  });
  const frontendTemplate = Template.fromStack(frontend);
  frontendTemplate.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  frontendTemplate.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
  frontendTemplate.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
    ResponseHeadersPolicyConfig: {
      SecurityHeadersConfig: { ContentTypeOptions: { Override: true } },
    },
  });
  const backendTemplate = Template.fromStack(backend);
  backendTemplate.hasResourceProperties("AWS::ECS::Service", {
    DesiredCount: 2,
    NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: "DISABLED" } },
  });
  backendTemplate.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
    Port: 443,
    Protocol: "HTTPS",
  });
  backendTemplate.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckPath: "/api/health/ready",
  });
  const task = Object.values(backendTemplate.findResources("AWS::ECS::TaskDefinition"))[0] as {
    Properties: { ContainerDefinitions: Array<{ Environment: Array<{ Name: string; Value: string }>; Secrets: Array<{ Name: string }> }> }
  };
  const container = task.Properties.ContainerDefinitions[0];
  assert.ok(container.Environment.some((entry) => entry.Name === "COOKIE_SAME_SITE" && entry.Value === "lax"));
  assert.ok(container.Environment.some((entry) => entry.Name === "NODE_ENV" && entry.Value === "production"));
  assert.ok(container.Secrets.some((entry) => entry.Name === "MONGO_URL"));
  assert.ok(container.Secrets.some((entry) => entry.Name === "JWT_SECRET_KEY"));
});

test("prod topology has one NAT per AZ and Redis failover", () => {
  const prodEnv = Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key.replace("BLINKMEET_DEV_", "BLINKMEET_PROD_"), value,
  ]));
  const config = loadStageConfig("prod", prodEnv);
  const app = new App();
  const props = { env: { account: config.account, region: config.region } };
  const network = new NetworkStack(app, "BlinkMeetProdNetwork", config, props);
  const redis = new RedisStack(app, "BlinkMeetProdRedis", config, network, props);
  Template.fromStack(network).resourceCountIs("AWS::EC2::NatGateway", 2);
  Template.fromStack(redis).hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
    NumCacheClusters: 2,
    AutomaticFailoverEnabled: true,
    MultiAZEnabled: true,
  });
});

test("scoped deployments only require configuration for their component", () => {
  const backend = loadStageConfig("dev", {
    ...env,
    BLINKMEET_DEV_FRONTEND_CERTIFICATE_ARN: "",
  }, "backend");
  assert.equal(backend.frontendCertificateArn, "");
  assert.equal(backend.imageTag, env.BLINKMEET_DEV_IMAGE_TAG);

  const frontend = loadStageConfig("dev", {
    ...env,
    BLINKMEET_DEV_API_CERTIFICATE_ARN: "",
    BLINKMEET_DEV_MONGO_SECRET_ARN: "",
    BLINKMEET_DEV_JWT_SECRET_ARN: "",
    BLINKMEET_DEV_IMAGE_TAG: "",
  }, "frontend");
  assert.equal(frontend.apiCertificateArn, "");
  assert.equal(frontend.imageTag, "");
  assert.equal(frontend.mongoSecretArn, "");
  assert.throws(() => loadStageConfig("dev", env, "broken" as "all"), /component/);
});
