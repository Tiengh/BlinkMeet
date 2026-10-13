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
  [[ -n "$api" ]] || fail "$api_var is missing"
  curl --fail --silent --show-error --max-time 20 "https://$api/api/health/ready" ||
    fail "API readiness failed (Atlas, Redis, DNS, ALB and TLS)"
  note "API readiness passed"
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
