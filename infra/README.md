# BlinkMeet Phase 10 — DynamoDB deployment

The application uses DynamoDB for users, email uniqueness, friend requests, friendships, conversations and messages. Redis remains the distributed store for matchmaking, presence, rate limits and Socket.IO. CDK creates seven DynamoDB tables, a DynamoDB Gateway VPC endpoint for ECS application subnet route tables, ECR, Redis, ECS/ALB and optional S3/CloudFront. AWS SDK v3 uses the ECS **task role**; containers do not need AWS access keys or a database password.

See [DYNAMODB_ACCESS_PATTERNS.md](DYNAMODB_ACCESS_PATTERNS.md) for keys, indexes, consistency and concurrency rules.

## Local development

Copy the three root/backend/frontend `.env.example` files to their respective `.env` files and set local JWT, frontend and TURN settings. `docker compose up --build` starts DynamoDB Local, Redis, coturn, backend and frontend. If Docker Desktop cannot bind the default TURN relay UDP range, set `TURN_RELAY_MIN_PORT` and `TURN_RELAY_MAX_PORT` to an available range before starting Compose. Backend startup runs `backend/scripts/create-local-tables.js`, which creates missing tables without erasing existing data. Local data persists in the `dynamodb_data` volume. To reset disposable local data, use `docker compose down -v` after reviewing all Compose volumes.

Compose sets dummy AWS credentials only for DynamoDB Local, the endpoint `http://dynamodb:8000` and all seven table names. ECS uses the normal AWS credential chain with no endpoint override. After the backend is healthy, `cd backend && npm run smoke:local` checks auth, friendship and Socket.IO chat; it creates disposable local users.

## AWS configuration and deployment

Copy `infra/config/dev.env.example` to gitignored `infra/config/dev.env`, then set account, Region, two AZs, immutable image tag, DNS names, issued ACM certificates and JWT secret ARN. Stream Video and external coturn secrets are optional. The API certificate belongs to the deployment Region; the CloudFront certificate belongs to `us-east-1`. Sibling API/frontend domains are required for browser cookie authentication. No MongoDB Atlas connection or NAT IP allowlist is used.

Bootstrap CDK once for the account and Region. Build and push the backend image to the `blinkmeet-dev-backend` ECR repository using its immutable tag before deploying Backend. `./infra/scripts/deploy.sh dev --backend-only` deploys Network, DynamoDb, Registry, Redis and Backend. `--frontend-only` deploys S3/CloudFront after account verification permits it. The full command deploys both scopes. The script performs local checks, CDK synth/diff and a typed confirmation before AWS changes. It does not publish Docker images, upload Vite assets or create DNS records.

On the first deployment, create the Registry stack before pushing the image. Run these commands from `BlinkMeet/` after reviewing `dev.env` and AWS identity:

```bash
set -a
source infra/config/dev.env
set +a
export AWS_REGION="$BLINKMEET_DEV_REGION" AWS_DEFAULT_REGION="$BLINKMEET_DEV_REGION"
aws sts get-caller-identity
(cd infra/cdk && npm ci && npx cdk -c stage=dev -c component=backend deploy BlinkMeetDevRegistry)
aws ecr get-login-password --region "$BLINKMEET_DEV_REGION" |
  docker login --username AWS --password-stdin "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com"
docker build -t "blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG" ./backend
docker tag "blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG" \
  "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com/blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG"
docker push "$BLINKMEET_DEV_ACCOUNT_ID.dkr.ecr.$BLINKMEET_DEV_REGION.amazonaws.com/blinkmeet-dev-backend:$BLINKMEET_DEV_IMAGE_TAG"
./infra/scripts/deploy.sh dev --backend-only
./infra/scripts/verify.sh dev --backend-only
```

For frontend deployment, build with the actual API/socket origins, deploy the frontend stack, then upload assets and invalidate CloudFront:

```bash
./infra/scripts/deploy.sh dev --frontend-only
(cd frontend && npm ci && VITE_API_URL="https://$BLINKMEET_DEV_API_DOMAIN/api" \
  VITE_SOCKET_URL="https://$BLINKMEET_DEV_API_DOMAIN" npm run build)
bucket=$(aws cloudformation describe-stacks --stack-name BlinkMeetDevFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue | [0]" --output text)
distribution=$(aws cloudformation describe-stacks --stack-name BlinkMeetDevFrontend \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue | [0]" --output text)
aws s3 sync frontend/dist/ "s3://$bucket/" --delete
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*'
./infra/scripts/verify.sh dev
```

The frontend commands require the DNS records and issued certificates to match the configured names. Browser login, WSS and cookies are only supported over the tested HTTPS origins.

For an infrastructure-only backend deployment without a domain, leave `BLINKMEET_DEV_API_DOMAIN`, `BLINKMEET_DEV_FRONTEND_DOMAIN` and the API certificate empty and run `--backend-only`. CDK creates an **internal** HTTP ALB reachable only within the VPC, so this mode validates ECS target health but cannot serve browser login. Set sibling domains and HTTPS certificates for the public API and frontend. Changing from an internal to a public ALB may replace the load balancer; review `cdk diff`.

After deploying, upload the Vite build to the S3 bucket, invalidate CloudFront and configure DNS if deploying frontend. Run `./infra/scripts/verify.sh dev` or a scoped variant. The script checks API readiness or private ALB health and active DynamoDB tables. Complete browser, WSS across two ECS tasks, friend/chat concurrency and forced TURN checks manually or through a separate end-to-end run.

`./infra/scripts/destroy.sh dev` requires a typed account-specific confirmation and deletes the dev stacks in reverse dependency order. Dev DynamoDB tables and their data are disposable under the agreed Phase 10 dev policy and are deleted with the stack. Production tables use `RETAIN`, PITR and deletion protection; production destruction is rejected. An ECS image rollback does not reverse DynamoDB writes; use a previous immutable image only with compatible table/index contracts.

NAT remains in the VPC for external services such as Stream APIs and ECR/logs/secrets traffic without dedicated endpoints. DynamoDB traffic goes through the Gateway endpoint. Dev uses one NAT gateway; prod uses one per AZ.
