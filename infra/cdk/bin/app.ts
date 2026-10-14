#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { DeploymentComponent, loadStageConfig } from "../config/stage";
import { NetworkStack } from "../lib/network-stack";
import { RegistryStack } from "../lib/registry-stack";
import { RedisStack } from "../lib/redis-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { BackendStack } from "../lib/backend-stack";
import { DynamoDbStack } from "../lib/dynamodb-stack";

const app = new App();
const component = String(app.node.tryGetContext("component") || "all");
if (!["all", "backend", "frontend"].includes(component)) {
  throw new Error("CDK context component must be all, backend, or frontend");
}
const config = loadStageConfig(
  String(app.node.tryGetContext("stage") || ""),
  process.env,
  component as DeploymentComponent,
);
// Some CDK constructs consult Stack.availabilityZones even when VPC AZs are explicit.
// Seed the account-specific value from reviewed stage config to keep synth offline.
app.node.setContext(
  `availability-zones:account=${config.account}:region=${config.region}`,
  config.availabilityZones,
);
const env = { account: config.account, region: config.region };
const name = `BlinkMeet${config.stage === "dev" ? "Dev" : "Prod"}`;
if (component !== "frontend") {
  const network = new NetworkStack(app, `${name}Network`, config, { env });
  const registry = new RegistryStack(app, `${name}Registry`, config, { env });
  const redis = new RedisStack(app, `${name}Redis`, config, network, { env });
  const dynamo = new DynamoDbStack(app, `${name}DynamoDb`, config, { env });
  new BackendStack(app, `${name}Backend`, config, network, redis, dynamo, registry.repository, { env });
}
if (component !== "backend") {
  new FrontendStack(app, `${name}Frontend`, config, { env });
}
Tags.of(app).add("Application", "BlinkMeet");
Tags.of(app).add("Stage", config.stage);
