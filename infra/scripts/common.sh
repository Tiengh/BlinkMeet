#!/usr/bin/env bash
set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CDK_DIR="$INFRA_DIR/cdk"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

load_stage() {
  local stage="$1"
  [[ "$stage" == dev || "$stage" == prod ]] || fail "Stage must be dev or prod"
  STAGE="$stage"
  STAGE_CAP="${stage^}"
  PREFIX="BLINKMEET_${stage^^}_"
  local config_file="$INFRA_DIR/config/$stage.env"
  if [[ -f "$config_file" ]]; then
    # This is an operator-owned local environment file, never committed.
    set -a
    # shellcheck source=/dev/null
    source "$config_file"
    set +a
  fi
  ACCOUNT_VAR="${PREFIX}ACCOUNT_ID"
  REGION_VAR="${PREFIX}REGION"
  ACCOUNT="${!ACCOUNT_VAR:-}"
  REGION="${!REGION_VAR:-}"
  [[ "$ACCOUNT" =~ ^[0-9]{12}$ ]] || fail "$ACCOUNT_VAR must be a 12-digit AWS account ID"
  [[ "$REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || fail "$REGION_VAR must be an AWS Region"
  STACKS=("BlinkMeet${STAGE_CAP}Network" "BlinkMeet${STAGE_CAP}Registry" "BlinkMeet${STAGE_CAP}Redis" "BlinkMeet${STAGE_CAP}Frontend" "BlinkMeet${STAGE_CAP}Backend")
}

check_aws_identity() {
  command -v aws >/dev/null || fail "Install AWS CLI v2"
  local configured_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
  if [[ -z "$configured_region" ]]; then
    configured_region="$(aws configure get region 2>/dev/null || true)"
  fi
  [[ "$configured_region" == "$REGION" ]] || fail "Configured AWS Region '$configured_region' does not match $STAGE Region '$REGION'"
  local actual_account
  actual_account="$(aws sts get-caller-identity --query Account --output text)" || fail "AWS credentials are unavailable"
  [[ "$actual_account" == "$ACCOUNT" ]] || fail "AWS account '$actual_account' does not match $STAGE account '$ACCOUNT'"
  export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
  note "AWS target: stage=$STAGE account=$ACCOUNT region=$REGION"
}

check_bootstrap() {
  aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus' --output text >/dev/null 2>&1 ||
    fail "CDKToolkit is missing. Run the one-time cdk bootstrap command in infra/README.md"
}

check_tools() {
  command -v node >/dev/null || fail "Install Node.js"
  command -v npm >/dev/null || fail "Install npm"
  command -v curl >/dev/null || fail "Install curl"
  [[ -f "$CDK_DIR/package-lock.json" ]] || fail "CDK package-lock.json is missing"
}

stack_exists() {
  local result
  result="$(aws cloudformation list-stacks --query "StackSummaries[?StackName=='$1' && StackStatus!='DELETE_COMPLETE'].StackName" --output text)" ||
    fail "Cannot list CloudFormation stacks"
  [[ "$result" == "$1" ]]
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text
}

cdk() {
  (cd "$CDK_DIR" && npx --no-install cdk -c "stage=$STAGE" "$@")
}

report_outputs() {
  local stack
  for stack in "${STACKS[@]}"; do
    if stack_exists "$stack"; then
      note "--- $stack outputs ---"
      aws cloudformation describe-stacks --stack-name "$stack" \
        --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
    fi
  done
}
