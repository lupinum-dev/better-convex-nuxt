#!/usr/bin/env bash
set -euo pipefail

run_probe() {
  local script_name="$1"

  echo
  echo "== $script_name"
  pnpm "$script_name"
}

run_probe feedback:better-auth-org
run_probe feedback:better-auth-user-additional-fields
run_probe feedback:better-auth-member-additional-fields
run_probe feedback:better-auth-org-lifecycle
run_probe feedback:better-auth-org-teams
run_probe feedback:better-auth-product-authz
run_probe feedback:better-auth-email-otp
run_probe feedback:better-auth-magic-link
run_probe feedback:better-auth-passkey-surface
run_probe feedback:better-auth-generic-oauth
run_probe feedback:better-auth-oauth-proxy

echo
echo "== final table inspection"
pnpm feedback:inspect

echo
echo "agent feedback loop passed"
