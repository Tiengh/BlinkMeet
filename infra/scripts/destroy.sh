#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ $# -eq 1 ]] || fail "Usage: $0 dev"
[[ "$1" == dev ]] || fail "Only disposable dev stacks can be destroyed by this script"
load_stage "$1"
check_tools
check_aws_identity
(cd "$CDK_DIR" && npm ci --no-audit --no-fund && npm run build)
note "Target stacks (dependency-safe deletion order):"
for ((i=${#STACKS[@]}-1; i>=0; i--)); do
  stack="${STACKS[i]}"
  if stack_exists "$stack"; then note "  $stack"; else note "  $stack (absent)"; fi
done
note "This removes dev NAT/EIPs, ALB, ECS, Redis, CloudFront, dev S3 objects and dev ECR images."
note "Retained resources, snapshots and MongoDB Atlas data/allowlist entries need separate review."
[[ -t 0 ]] || fail "Interactive confirmation is required; unattended destroy is disabled"
read -r -p "Type 'destroy $STAGE $ACCOUNT' to continue: " confirmation
[[ "$confirmation" == "destroy $STAGE $ACCOUNT" ]] || fail "Destruction cancelled"

frontend_bucket=""
if stack_exists "${STACKS[3]}"; then
  frontend_bucket="$(stack_output "${STACKS[3]}" FrontendBucketName)"
fi
for ((i=${#STACKS[@]}-1; i>=0; i--)); do
  stack="${STACKS[i]}"
  if stack_exists "$stack"; then
    cdk destroy "$stack"
    if stack_exists "$stack"; then fail "$stack still exists after CDK destroy"; fi
  else
    note "$stack is already absent"
  fi
done

note "Remaining tagged BlinkMeet dev resources (review for charges/retention):"
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Application,Values=BlinkMeet Key=Stage,Values=dev \
  --query 'ResourceTagMappingList[].ResourceARN' --output table ||
  fail "Could not inventory retained resources"
note "Remaining NAT Elastic IP allocations:"
aws ec2 describe-addresses --filters Name=tag:Application,Values=BlinkMeet Name=tag:Stage,Values=dev \
  --query 'Addresses[].[PublicIp,AllocationId]' --output table
note "Remaining backend log groups:"
aws logs describe-log-groups --log-group-name-prefix "/blinkmeet/dev/backend" \
  --query 'logGroups[].logGroupName' --output table
if [[ -n "$frontend_bucket" && "$frontend_bucket" != None ]]; then
  if aws s3api head-bucket --bucket "$frontend_bucket" >/dev/null 2>&1; then
    note "S3 bucket still exists: $frontend_bucket"
  fi
fi
note "Inspect Redis snapshots, ECR repositories/images and Atlas NAT IP entries separately. MongoDB Atlas was not modified."
