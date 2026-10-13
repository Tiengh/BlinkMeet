# Phase 10: AWS CDK deployment

This directory defines the AWS infrastructure for BlinkMeet. The application still stores user, friend and chat data in **MongoDB Atlas**. CDK does not create or remove Atlas data, Atlas users, or Atlas IP Access List entries.

## Architecture and cost

| Stack | Resources | Dev deletion |
| --- | --- | --- |
| Network | Two-AZ VPC, public/app/isolated subnets, one NAT Gateway + EIP, security groups | Destroy |
| Registry | Immutable ECR backend repository | Destroy with dev images |
| Redis | TLS-enabled, non-cluster ElastiCache Redis in isolated subnets | Destroy |
| Frontend | Private S3 bucket, CloudFront OAC, SPA route rewrite | Destroy with dev objects |
| Backend | Public HTTPS ALB, two private Fargate tasks, CloudWatch logs | Destroy |

`prod` synthesizes two NAT Gateways and a two-node Redis replication group with a seven-day snapshot window. Production deployment/destruction scripts are intentionally unavailable until a separate approval and recovery procedure exists; production Redis, S3, ECR and logs use `RETAIN`.

NAT, ALB, ECS, Redis and CloudFront have ongoing charges; dev is not free-tier sized. Set an AWS Budget before deployment. A single dev NAT is a cost choice and creates a cross-AZ dependency. TURN is **external** to these stacks: use the Phase 8 coturn endpoint or provision a separate public TURN host with its own UDP/TCP listener, relay range, auth secret, monitoring and DNS. Never route TURN media through the HTTP ALB.

## Prerequisites

1. Install Node.js 20+, npm, Docker, AWS CLI v2 and `curl`. Configure an AWS profile with CloudFormation, IAM, VPC, ECS, ECR, ElastiCache, S3, CloudFront, ACM, Secrets Manager and tagging permissions. Set `AWS_PROFILE` if needed and set `AWS_REGION` to the deployment Region.
2. Copy `infra/config/dev.env.example` to `infra/config/dev.env` and replace the example **identifiers**, not secret values. This file is gitignored. The script sources it into the environment. Set two actual Availability Zone names available to your account in `BLINKMEET_DEV_AZS`; explicit names let CDK synthesize without an AWS AZ lookup. For direct CDK commands, run `set -a; source infra/config/dev.env; set +a` first. The stage config rejects missing account, Region, AZs, domain, certificate, secret and immutable image tag fields. `prod.env.example` exists for synthesis review only.
3. Create two DNS names under the same parent domain, for example `app.dev.example.com` and `api.dev.example.com`. Obtain an issued ACM certificate for the API name in the deployment Region, and an issued ACM certificate for the CloudFront name in **us-east-1**. The CDK stacks do not create DNS records or certificates. After deploy, point the API name to the ALB and the app name to CloudFront. Same-site sibling domains keep the existing `SameSite=Lax` HttpOnly auth cookie usable across frontend/API requests.
4. Create **plaintext string** Secrets Manager secrets in the deployment Region for `MONGO_URL` (the existing Atlas TLS connection string) and `JWT_SECRET_KEY` (32+ random characters). Do not put secret contents in env files, CDK context, the image or Vite assets. The Atlas URI should use `mongodb+srv://` or enable TLS explicitly; never disable certificate verification. Optional legacy Stream Video friend calls require a public Stream API key plus a secret API key. Optional external coturn requires TURN URLs, its public IP and the matching shared secret. Secret ARNs are safe to place in the local stage config.
5. Bootstrap the account/Region **once** after checking the target identity:

   ```bash
   aws sts get-caller-identity
   aws configure get region
   cd infra/cdk
   npm ci
   npx cdk bootstrap aws://ACCOUNT_ID/REGION
   ```

   `deploy.sh` verifies the actual account, configured Region and `CDKToolkit`; it does not bootstrap implicitly.

## First application image and frontend build

The ECR repository must exist before the backend image can be pushed. Prepare it once (after loading `dev.env`), then build and push an immutable image:

```bash
cd infra/cdk
npm ci
npx cdk synth -c stage=dev
npx cdk diff -c stage=dev BlinkMeetDevRegistry
npx cdk deploy -c stage=dev BlinkMeetDevRegistry
cd ../..
aws ecr get-login-password --region "$BLINKMEET_DEV_REGION" |
  docker login --username AWS --password-stdin "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com"
docker build -t "blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG" ./backend
docker tag "blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG" \
  "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com/blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG"
docker push "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com/blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG"
```

This image includes only the production backend dependencies and source, runs as the `node` user, and listens on port 3000. Local Docker Compose sets `NODE_ENV=development` and port 5001. The image tag is immutable; choose a new tag for each release and update `BLINKMEET_DEV_IMAGE_TAG` before the next CDK deployment.

Build frontend assets with public browser URLs, then upload them **after** the frontend stack exists. Never put a secret in a `VITE_*` variable:

```bash
cd frontend
npm ci
VITE_API_URL="https://$BLINKMEET_DEV_API_DOMAIN/api" \
VITE_SOCKET_URL="https://$BLINKMEET_DEV_API_DOMAIN" \
VITE_STREAM_API_KEY="${BLINKMEET_DEV_STREAM_API_KEY:-}" npm run build
cd ..
bucket="$(aws cloudformation describe-stacks --stack-name BlinkMeetDevFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue | [0]" --output text)"
aws s3 sync frontend/dist/ "s3://$bucket/" --delete
distribution="$(aws cloudformation describe-stacks --stack-name BlinkMeetDevFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue | [0]" --output text)"
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*'
```

## Deploy and verify

Run from any directory: `./infra/scripts/deploy.sh dev`, or scope the rollout with `--backend-only` / `--frontend-only`. It validates tools, AWS identity, bootstrap and credentials/certificates for the selected component; installs locked CDK dependencies; runs checks, synth and diff; then deploys the selected dev stacks. The backend stack is deferred until its ECR image exists and you confirm the NAT EIP allowlist step. It reports stack outputs and waits for ECS stability. Run `./infra/scripts/verify.sh dev` only after publishing the frontend and setting DNS, or scope the checks using `--backend-only` / `--frontend-only`. A deployment failure can leave billable partial resources.

After the Network stack is deployed, add **each output NAT public IP as a `/32`** in the Atlas project IP Access List before confirming the backend deployment. Remove obsolete NAT IPs from Atlas manually after a destroy/redeploy. Do not allowlist `0.0.0.0/0`. Atlas DNS/SRV and outbound TCP to its hosts must work through NAT. `rediss://` connects to private ElastiCache with in-transit encryption; the SG permits Redis only from backend tasks. This baseline uses no Redis AUTH token, relying on private isolated subnets and SG rules. Add Redis authentication before using a less restricted network design.

After deploy, configure the DNS records and upload frontend assets, then run `./infra/scripts/verify.sh dev`. Verify separately:

```bash
curl -fsS "https://$BLINKMEET_DEV_API_DOMAIN/api/health/ready"
curl -fI "https://$BLINKMEET_DEV_FRONTEND_DOMAIN/"
aws ecs describe-services --cluster "$(aws cloudformation describe-stacks --stack-name BlinkMeetDevBackend --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue | [0]" --output text)" \
  --services "$(aws cloudformation describe-stacks --stack-name BlinkMeetDevBackend --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue | [0]" --output text)" \
  --query 'services[0].[runningCount,desiredCount]' --output table
```

In two browsers/accounts, verify WebSocket upgrade through the ALB, matchmaking while two ECS tasks are running, presence and chat across task boundaries, a direct WebRTC call, and a forced TURN relay call if TURN is configured. The frontend socket client uses WebSocket-only transport, avoiding the polling affinity requirement. ALB idle timeout is 120 seconds. Check backend logs and ALB target health if WSS or readiness fails.

## Destroy, redeploy and rollback

`./infra/scripts/destroy.sh dev` lists exact stacks, requires a typed `destroy dev ACCOUNT_ID` confirmation on a terminal, removes only dev stacks in reverse dependency order, verifies stack absence, and inventories tagged resources, EIPs, logs and the former S3 bucket. It never deletes Atlas or edits its IP Access List. CDK may ask for another confirmation per stack. If deletion fails, inspect the CloudFormation event and retained resources; the script stops rather than forcing deletion. A second invocation safely reports absent stacks.

For the phase regression, run **deploy → smoke test → destroy → verify cleanup → redeploy** in a disposable AWS account. After redeploy, compare the new NAT EIP outputs, update the Atlas allowlist, and repeat TLS/readiness, WSS, multi-task and TURN checks. Record the actual account/Region, EIPs, test results and costs in your deployment notes. This repository cannot claim this cloud lifecycle was exercised without credentials and an Atlas project.

For an application rollback, set the previous immutable ECR image tag in the stage config, review `cdk diff`, and redeploy the Backend stack or run the guarded dev deploy script. ECS circuit breaker rolls back failed service deployments, but it does not revert Atlas data changes. For infrastructure rollback, inspect CloudFormation stack events and `cdk diff`, then revert the CDK source/config and redeploy after reviewing stateful resource changes. Avoid deleting Redis, S3 or ECR in production; the prod stacks retain persistent resources by default.

## Deploy without CloudFront while account verification is pending

The AWS account may temporarily reject CloudFront creation with "Your account must be verified before you can add new CloudFront resources." To continue infrastructure development without touching CloudFront:

```bash
./infra/scripts/deploy.sh dev --backend-only
# After setting API DNS and confirming the ECR image / Atlas NAT allowlist:
./infra/scripts/verify.sh dev --backend-only
```

The backend-only CDK app creates Network, Registry, Redis and Backend stacks. It does not synthesize or deploy CloudFront and does not require a CloudFront ACM certificate. The backend is publicly reachable through the HTTPS ALB and API hostname after DNS configuration. Browser-to-API CORS still requires an allowed frontend origin. Backend-only mode does not provision a temporary frontend website.

Once CloudFront is unblocked, update/issue the frontend certificate and run:

```bash
./infra/scripts/deploy.sh dev --frontend-only
# Upload Vite dist to the reported S3 bucket, configure frontend DNS, invalidate CloudFront:
./infra/scripts/verify.sh dev --frontend-only
```

The default `deploy.sh dev` handles all stacks; the frontend-only command does not change ECS, NAT, Redis or Atlas. Always review `cdk diff`. The script intentionally does not automatically destroy resources when a deployment fails, avoiding accidental data loss. Use the guarded dev-only destroy script if cleanup is required.

For direct commands, specify `-c component=backend` or `-c component=frontend` alongside `-c stage=dev`. With no component context, CDK synthesizes the complete app.

The API container is API-only; unknown routes return JSON 404 rather than attempting to load `frontend/dist/index.html`. ALB target health checks use database/Redis readiness with ECS grace period. CloudFront adds baseline browser security headers; CSP should be configured separately after integration testing.
