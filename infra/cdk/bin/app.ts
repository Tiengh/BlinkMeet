#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { loadStageConfig } from "../config/stage";
import { NetworkStack } from "../lib/network-stack";
import { RegistryStack } from "../lib/registry-stack";
import { RedisStack } from "../lib/redis-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { BackendStack } from "../lib/backend-stack";

const app = new App();
const config = loadStageConfig(String(app.node.tryGetContext("stage") || ""));
// Some CDK constructs consult Stack.availabilityZones even when VPC AZs are explicit.
// Seed the account-specific value from reviewed stage config to keep synth offline.
app.node.setContext(
  `availability-zones:account=${config.account}:region=${config.region}`,
  config.availabilityZones,
);
const env = { account: config.account, region: config.region };
const name = `BlinkMeet${config.stage === "dev" ? "Dev" : "Prod"}`;
const network = new NetworkStack(app, `${name}Network`, config, { env });
const registry = new RegistryStack(app, `${name}Registry`, config, { env });
const redis = new RedisStack(app, `${name}Redis`, config, network, { env });
new FrontendStack(app, `${name}Frontend`, config, { env });
new BackendStack(app, `${name}Backend`, config, network, redis, registry.repository, { env });
Tags.of(app).add("Application", "BlinkMeet");
Tags.of(app).add("Stage", config.stage);
