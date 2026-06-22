#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

server_pid=""
started_server="false"
tmpdir="$(mktemp -d)"
server_log="$tmpdir/convex-dev.log"

cleanup() {
  local status="$?"

  if [[ "$started_server" == "true" ]]; then
    if [[ -n "$server_pid" ]]; then
      kill "$server_pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$server_pid" >/dev/null 2>&1 || true
      wait "$server_pid" >/dev/null 2>&1 || true
    fi

    for port in 3210 3211; do
      while IFS= read -r pid; do
        [[ -n "$pid" ]] && kill "$pid" >/dev/null 2>&1 || true
      done < <(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    done
  fi

  if [[ "$status" != "0" && -f "$server_log" ]]; then
    echo
    echo "== convex dev log tail"
    tail -n 120 "$server_log" || true
  fi

  rm -rf "$tmpdir"
}
trap cleanup EXIT

port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_local_convex() {
  local deadline="$((SECONDS + 90))"

  while ((SECONDS < deadline)); do
    if [[ "$started_server" == "true" ]] && ! kill -0 "$server_pid" >/dev/null 2>&1; then
      echo "convex dev exited before becoming ready" >&2
      return 1
    fi

    if port_listening 3210 && port_listening 3211; then
      return 0
    fi

    sleep 1
  done

  echo "timed out waiting for local Convex ports 3210 and 3211" >&2
  return 1
}

run_probe() {
  local script_name="$1"

  echo
  echo "== $script_name"
  pnpm "$script_name"
}

if port_listening 3210 || port_listening 3211; then
  if ! port_listening 3210 || ! port_listening 3211; then
    echo "expected both local Convex ports 3210 and 3211 to be free or both to be listening" >&2
    exit 1
  fi

  echo "== using existing local Convex server on ports 3210 and 3211"
else
  echo "== starting local Convex server"
  pnpm convex:dev >"$server_log" 2>&1 &
  server_pid="$!"
  started_server="true"
fi

wait_for_local_convex

run_probe feedback:better-auth-org
run_probe feedback:better-auth-client-surface
run_probe feedback:better-auth-user-additional-fields
run_probe feedback:better-auth-member-additional-fields
run_probe feedback:better-auth-org-lifecycle
run_probe feedback:better-auth-org-delete-product-access
run_probe feedback:better-auth-org-safe-delete-teams-limit
run_probe feedback:better-auth-org-allow-remove-all-teams
run_probe feedback:better-auth-org-limits
run_probe feedback:better-auth-org-teams
run_probe feedback:better-auth-product-authz
run_probe feedback:better-auth-session-lifecycle
run_probe feedback:better-auth-dynamic-roles
run_probe feedback:better-auth-admin
run_probe feedback:better-auth-two-factor
run_probe feedback:better-auth-email-otp
run_probe feedback:better-auth-magic-link
run_probe feedback:better-auth-api-keys
run_probe feedback:better-auth-user-api-keys
run_probe feedback:better-auth-api-key-product-route
run_probe feedback:better-auth-api-key-lifecycle
run_probe feedback:better-auth-api-key-safe-org-delete
run_probe feedback:better-auth-passkey-surface
run_probe feedback:better-auth-enterprise-surface
run_probe feedback:better-auth-stripe
run_probe feedback:better-auth-scim
run_probe feedback:better-auth-oidc-provider
run_probe feedback:better-auth-device-authorization
run_probe feedback:better-auth-device-product-authz
run_probe feedback:better-auth-mcp-runtime
run_probe feedback:better-auth-generic-oauth
run_probe feedback:better-auth-oauth-proxy
run_probe feedback:better-auth-oauth-product-route
run_probe feedback:better-auth-oauth-token-lifecycle
run_probe feedback:better-auth-oauth-client-credentials-limit

echo
echo "== final hard reset"
pnpm experiment:hard-reset >/dev/null

echo
echo "== final table inspection"
pnpm feedback:inspect

echo
echo "better-auth full feedback suite passed"
