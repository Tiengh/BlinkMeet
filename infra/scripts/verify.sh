#!/usr/bin/env bash
set -Eeuo pipefail
# shellcheck source=common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
[[ $# -ge 1 && $# -le 2 ]] || fail "Usage: $0 dev [--backend-only|--frontend-only]"
load_stage "$1"
case "${2:-}" in
  "") select_component all;;
  --backend-only) select_component backend;;
  --frontend-only) select_component frontend;;
  *) fail "Unknown option: $2";;
esac
check_tools
check_aws_identity
if [[ "$COMPONENT" != frontend ]]; then
  api_var="${PREFIX}API_DOMAIN"
  api="${!api_var:-}"
  if [[ -n "$api" ]]; then
    curl --fail --silent --show-error --max-time 20 "https://$api/api/health/ready" ||
      fail "API readiness failed (DynamoDB, Redis, DNS, ALB or TLS)"
    note "Public API readiness passed"
    cookie_jar="$(mktemp)"
    trap 'rm -f "$cookie_jar"' EXIT
    verify_email="blinkmeet-verify-${ACCOUNT}-$(date +%s%N)@example.invalid"
    curl --fail --silent --show-error --max-time 20 -o /dev/null -c "$cookie_jar" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"Phase 10 Verify\",\"email\":\"$verify_email\",\"password\":\"VerifyOnlyPass123!\"}" \
      "https://$api/api/auth/signup" || fail "API signup write through ECS task role failed"
    curl --fail --silent --show-error --max-time 20 -o /dev/null -b "$cookie_jar" \
      "https://$api/api/auth/me" || fail "API authenticated DynamoDB read failed"
    note "API signup and authenticated read passed"
  else
    cluster="$(stack_output "${BACKEND_STACKS[4]}" ClusterName)"
    service="$(stack_output "${BACKEND_STACKS[4]}" ServiceName)"
    aws ecs wait services-stable --cluster "$cluster" --services "$service" || fail "ECS is not stable"
    target_group="$(stack_output "${BACKEND_STACKS[4]}" TargetGroupArn)"
    healthy="$(aws elbv2 describe-target-health --target-group-arn "$target_group" \
      --query 'length(TargetHealthDescriptions[?TargetHealth.State==`healthy`])' --output text)"
    [[ "$healthy" -ge 1 ]] || fail "No healthy ALB targets"
    note "Private ALB target health passed; browser login requires HTTPS domains"
  fi
  for table in users emails friendrequests friendships conversations messages messagekeys; do
    aws dynamodb describe-table --table-name "blinkmeet-$STAGE-$table" \
      --query 'Table.TableStatus' --output text | grep -qx ACTIVE ||
      fail "DynamoDB table blinkmeet-$STAGE-$table is not active"
  done
  note "DynamoDB tables are active"
  vpc_id="$(stack_output "${BACKEND_STACKS[0]}" VpcId)"
  endpoint_routes="$(aws ec2 describe-vpc-endpoints \
    --filters "Name=vpc-id,Values=$vpc_id" "Name=service-name,Values=com.amazonaws.$REGION.dynamodb" \
    --query 'length(VpcEndpoints[?State==`available`].RouteTableIds[])' --output text)"
  [[ "$endpoint_routes" -ge 2 ]] || fail "DynamoDB Gateway endpoint is not attached to both application route tables"
  note "DynamoDB Gateway endpoint is available on application routes"
fi
if [[ "$COMPONENT" != backend ]]; then
  front_var="${PREFIX}FRONTEND_DOMAIN"
  domain="${!front_var:-}"
  [[ -n "$domain" ]] || fail "$front_var is missing"
  content="$(curl --fail --silent --show-error --max-time 20 "https://$domain/")" ||
    fail "Frontend response unavailable"
  [[ "$content" == *"<html"* || "$content" == *"<!doctype html"* || "$content" == *"<!DOCTYPE html"* ]] ||
    fail "Frontend response is not HTML"
  note "Frontend smoke check passed"
fi
note "HTTP checks complete; verify WebSocket multi-task and TURN manually."
