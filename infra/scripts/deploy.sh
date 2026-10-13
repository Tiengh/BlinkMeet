#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ $# -eq 1 ]] || fail "Usage: $0 dev (production deployment requires a separate approval process)"
[[ "$1" == dev ]] || fail "Only dev deployment is enabled by this script"
load_stage "$1"
check_tools
check_aws_identity
check_bootstrap

secret_vars=(MONGO_SECRET_ARN JWT_SECRET_ARN)
for suffix in "${secret_vars[@]}"; do
  var="${PREFIX}${suffix}"
  arn="${!var:-}"
  [[ -n "$arn" ]] || fail "$var is required"
  aws secretsmanager describe-secret --secret-id "$arn" --query ARN --output text >/dev/null ||
    fail "Required secret $var is unavailable"
done
for suffix in STREAM_API_SECRET_ARN TURN_SECRET_ARN; do
  var="${PREFIX}${suffix}"
  arn="${!var:-}"
  if [[ -n "$arn" ]]; then
    aws secretsmanager describe-secret --secret-id "$arn" --query ARN --output text >/dev/null ||
      fail "Optional secret $var is unavailable"
  fi
done

api_cert_var="${PREFIX}API_CERTIFICATE_ARN"
front_cert_var="${PREFIX}FRONTEND_CERTIFICATE_ARN"
aws acm describe-certificate --certificate-arn "${!api_cert_var:-}" --query 'Certificate.Status' --output text | grep -qx ISSUED ||
  fail "API certificate must be ISSUED in $REGION"
aws --region us-east-1 acm describe-certificate --certificate-arn "${!front_cert_var:-}" --query 'Certificate.Status' --output text | grep -qx ISSUED ||
  fail "Frontend certificate must be ISSUED in us-east-1"

note "Installing locked CDK dependencies and validating TypeScript"
(cd "$CDK_DIR" && npm ci --no-audit --no-fund && npm run build && npm test)
note "Synthesizing and diffing only ${STACKS[*]}"
cdk synth "${STACKS[@]}" >/dev/null
cdk diff "${STACKS[@]}"

note "Image build/push and frontend asset upload are separate release steps."
note "This run will create billable NAT, ALB, ECS, Redis and CloudFront resources."
[[ -t 0 ]] || fail "Interactive confirmation is required"
read -r -p "Type 'deploy $STAGE $ACCOUNT' to continue: " confirmation
[[ "$confirmation" == "deploy $STAGE $ACCOUNT" ]] || fail "Deployment cancelled"

for stack in "${STACKS[@]:0:4}"; do
  cdk deploy "$stack" --require-approval never
done

note "NAT public IPs (allowlist each /32 in MongoDB Atlas before continuing):"
aws cloudformation describe-stacks --stack-name "${STACKS[0]}" \
  --query "Stacks[0].Outputs[?starts_with(OutputKey, 'NatPublicIp')].[OutputKey,OutputValue]" --output table

image_tag_var="${PREFIX}IMAGE_TAG"
image_tag="${!image_tag_var:-}"
if ! aws ecr describe-images --repository-name "blinkmeet-$STAGE-backend" --image-ids "imageTag=$image_tag" --query 'imageDetails[0].imageDigest' --output text >/dev/null 2>&1; then
  fail "ECR image $image_tag is missing. Build/push it using infra/README.md, then rerun deploy.sh $STAGE"
fi
read -r -p "After updating the Atlas IP Access List, type 'atlas $STAGE $ACCOUNT': " atlas_confirmation
[[ "$atlas_confirmation" == "atlas $STAGE $ACCOUNT" ]] || fail "Backend deployment paused until Atlas allowlisting is confirmed"
cdk deploy "${STACKS[4]}" --require-approval never

report_outputs
cluster="$(stack_output "${STACKS[4]}" ClusterName)"
service="$(stack_output "${STACKS[4]}" ServiceName)"
aws ecs wait services-stable --cluster "$cluster" --services "$service" || fail "ECS service did not stabilize"
api_domain_var="${PREFIX}API_DOMAIN"
frontend_domain_var="${PREFIX}FRONTEND_DOMAIN"
curl --fail --silent --show-error --max-time 15 "https://${!api_domain_var}/api/health/ready" ||
  fail "API/Redis/Atlas readiness failed. Check DNS, Atlas allowlist, ECS logs and TLS."
curl --fail --silent --show-error --max-time 15 "https://${!frontend_domain_var}/" >/dev/null ||
  fail "Frontend smoke test failed. Upload the Vite dist assets and check CloudFront/DNS."
note "Infrastructure and HTTP readiness checks passed. Verify WSS, two-task matchmaking and TURN manually per infra/README.md."
