export type Stage = "dev" | "prod";
export type DeploymentComponent = "all" | "backend" | "frontend";

export interface StageConfig {
  stage: Stage;
  account: string;
  region: string;
  availabilityZones: [string, string];
  vpcCidr: string;
  natGateways: number;
  desiredCount: number;
  redisNodeType: string;
  imageTag: string;
  apiDomain: string;
  frontendDomain: string;
  apiCertificateArn: string;
  frontendCertificateArn: string;
  mongoSecretArn: string;
  jwtSecretArn: string;
  streamApiKey?: string;
  streamApiSecretArn?: string;
  turnUrls?: string;
  turnExternalIp?: string;
  turnSecretArn?: string;
}

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for CDK synthesis`);
  return value;
};

export function loadStageConfig(
  stage: string,
  env = process.env,
  component: DeploymentComponent = "all",
): StageConfig {
  if (stage !== "dev" && stage !== "prod") {
    throw new Error("CDK context stage must be dev or prod");
  }
  if (!["all", "backend", "frontend"].includes(component)) {
    throw new Error("Deployment component must be all, backend, or frontend");
  }
  const includeBackend = component !== "frontend";
  const includeFrontend = component !== "backend";
  const prefix = `BLINKMEET_${stage.toUpperCase()}_`;
  const account = required(env, `${prefix}ACCOUNT_ID`);
  const region = required(env, `${prefix}REGION`);
  if (!/^\d{12}$/.test(account)) throw new Error(`${prefix}ACCOUNT_ID must be a 12-digit AWS account ID`);
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error(`${prefix}REGION is invalid`);
  const azs = required(env, `${prefix}AZS`).split(",").map((az) => az.trim());
  if (azs.length !== 2 || azs[0] === azs[1] || azs.some((az) => !new RegExp(`^${region}[a-z]$`).test(az))) {
    throw new Error(`${prefix}AZS must contain two distinct Availability Zones in ${region}`);
  }
  const imageTag = includeBackend ? required(env, `${prefix}IMAGE_TAG`) : "";
  if (includeBackend && (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(imageTag) || imageTag === "latest")) {
    throw new Error(`${prefix}IMAGE_TAG must be an immutable, non-latest tag`);
  }
  const apiDomain = required(env, `${prefix}API_DOMAIN`);
  const frontendDomain = required(env, `${prefix}FRONTEND_DOMAIN`);
  if (apiDomain === frontendDomain || !apiDomain.includes(".") || !frontendDomain.includes(".")) {
    throw new Error("API_DOMAIN and FRONTEND_DOMAIN must be different DNS names");
  }
  if (apiDomain.split(".").slice(1).join(".") !== frontendDomain.split(".").slice(1).join(".")) {
    throw new Error("API_DOMAIN and FRONTEND_DOMAIN must be sibling subdomains for SameSite cookies");
  }
  const turnUrls = env[`${prefix}TURN_URLS`]?.trim();
  const turnExternalIp = env[`${prefix}TURN_EXTERNAL_IP`]?.trim();
  const turnSecretArn = env[`${prefix}TURN_SECRET_ARN`]?.trim();
  if (turnUrls && (!turnExternalIp || !turnSecretArn)) {
    throw new Error("TURN_URLS requires TURN_EXTERNAL_IP and TURN_SECRET_ARN");
  }
  const apiCertificateArn = includeBackend ? required(env, `${prefix}API_CERTIFICATE_ARN`) : "";
  const frontendCertificateArn = includeFrontend ? required(env, `${prefix}FRONTEND_CERTIFICATE_ARN`) : "";
  if (includeBackend && !apiCertificateArn.startsWith(`arn:aws:acm:${region}:${account}:certificate/`)) {
    throw new Error("API_CERTIFICATE_ARN must belong to the deployment account and Region");
  }
  if (includeFrontend && !frontendCertificateArn.startsWith(`arn:aws:acm:us-east-1:${account}:certificate/`)) {
    throw new Error("FRONTEND_CERTIFICATE_ARN must belong to the deployment account in us-east-1");
  }
  return {
    stage,
    account,
    region,
    availabilityZones: azs as [string, string],
    vpcCidr: stage === "dev" ? "10.42.0.0/16" : "10.43.0.0/16",
    natGateways: stage === "dev" ? 1 : 2,
    desiredCount: 2,
    redisNodeType: stage === "dev" ? "cache.t4g.micro" : "cache.t4g.small",
    imageTag,
    apiDomain,
    frontendDomain,
    apiCertificateArn,
    frontendCertificateArn,
    mongoSecretArn: includeBackend ? required(env, `${prefix}MONGO_SECRET_ARN`) : "",
    jwtSecretArn: includeBackend ? required(env, `${prefix}JWT_SECRET_ARN`) : "",
    streamApiKey: env[`${prefix}STREAM_API_KEY`]?.trim(),
    streamApiSecretArn: env[`${prefix}STREAM_API_SECRET_ARN`]?.trim(),
    turnUrls,
    turnExternalIp,
    turnSecretArn,
  };
}
