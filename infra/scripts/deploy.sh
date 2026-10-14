#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ $# -ge 1 && $# -le 2 ]] || fail "Usage: $0 dev [--backend-only|--frontend-only]"
[[ "$1" == dev ]] || fail "Only dev deployment is enabled by this script"
load_stage "$1"
case "${2:-}" in
  "") select_component all;;
  --backend-only) select_component backend;;
  --frontend-only) select_component frontend;;
  *) fail "Unknown option: $2";;
esac
check_tools
check_aws_identity
check_bootstrap

if [[ "$COMPONENT" != frontend ]]; then
  for suffix in JWT_SECRET_ARN STREAM_API_SECRET_ARN TURN_SECRET_ARN; do
    var="${PREFIX}${suffix}"
    arn="${!var:-}"
    if [[ -z "$arn" ]]; then
      [[ "$suffix" == JWT_SECRET_ARN ]] && fail "$var is required"
      continue
    fi
    aws secretsmanager describe-secret --secret-id "$arn" --query ARN --output text >/dev/null ||
      fail "Secret $var is unavailable"
  done
  api_domain_var="${PREFIX}API_DOMAIN"
  if [[ -n "${!api_domain_var:-}" ]]; then
    api_cert_var="${PREFIX}API_CERTIFICATE_ARN"
    aws acm describe-certificate --certificate-arn "${!api_cert_var:-}" --query 'Certificate.Status' --output text | grep -qx ISSUED ||
      fail "API certificate must be ISSUED in $REGION"
  fi
fi
if [[ "$COMPONENT" != backend ]]; then
  front_cert_var="${PREFIX}FRONTEND_CERTIFICATE_ARN"
  aws --region us-east-1 acm describe-certificate --certificate-arn "${!front_cert_var:-}" --query 'Certificate.Status' --output text | grep -qx ISSUED ||
    fail "Frontend certificate must be ISSUED in us-east-1"
fi

note "Installing and validating CDK for component=$COMPONENT"
if [[ "$COMPONENT" != frontend ]]; then
  command -v docker >/dev/null || fail "Install Docker for DynamoDB Local integration checks"
  (cd "$INFRA_DIR/.." && docker compose up -d dynamodb redis)
  (cd "$INFRA_DIR/../backend" && npm ci --no-audit --no-fund && \
    DYNAMODB_ENDPOINT=http://127.0.0.1:8000 npm run db:local:init && \
    DYNAMODB_ENDPOINT=http://127.0.0.1:8000 npm test && npm run lint)
fi
if [[ "$COMPONENT" != backend ]]; then
  (cd "$INFRA_DIR/../frontend" && npm ci --no-audit --no-fund && npm run build && npm run lint)
fi
(cd "$CDK_DIR" && npm ci --no-audit --no-fund && npm run build && npm test)
scoped_cdk synth "${SELECTED_STACKS[@]}" >/dev/null
scoped_cdk diff "${SELECTED_STACKS[@]}"
note "Application image publishing, frontend upload, DNS and smoke checks are separate steps."
note "AWS infrastructure may incur charges. Review the diff before proceeding."
[[ -t 0 ]] || fail "Interactive confirmation is required"
read -r -p "Type 'deploy $STAGE $ACCOUNT $COMPONENT' to continue: " confirmation
[[ "$confirmation" == "deploy $STAGE $ACCOUNT $COMPONENT" ]] || fail "Deployment cancelled"

if [[ "$COMPONENT" != frontend ]]; then
  # ECR must exist before the image can be published. Check it before billable VPC/Redis resources.
  scoped_cdk deploy "${BACKEND_STACKS[2]}" --require-approval never
  image_tag_var="${PREFIX}IMAGE_TAG"
  image_tag="${!image_tag_var:-}"
  [[ -n "$image_tag" ]] || fail "$image_tag_var is required"
  aws ecr describe-images --repository-name "blinkmeet-$STAGE-backend" --image-ids "imageTag=$image_tag" \
    --query 'imageDetails[0].imageDigest' --output text >/dev/null ||
    fail "ECR image $image_tag is missing. Build and push it before continuing."
  for stack in "${BACKEND_STACKS[0]}" "${BACKEND_STACKS[1]}" "${BACKEND_STACKS[3]}"; do
    scoped_cdk deploy "$stack" --require-approval never
  done
  scoped_cdk deploy "${BACKEND_STACKS[4]}" --require-approval never
  cluster="$(stack_output "${BACKEND_STACKS[4]}" ClusterName)"
  service="$(stack_output "${BACKEND_STACKS[4]}" ServiceName)"
  aws ecs wait services-stable --cluster "$cluster" --services "$service" ||
    fail "ECS service did not stabilize"
fi
if [[ "$COMPONENT" != backend ]]; then
  scoped_cdk deploy "$FRONTEND_STACK" --require-approval never
fi
report_outputs
note "Infrastructure deployment complete. Publish frontend assets/configure DNS, then run ./infra/scripts/verify.sh dev."
