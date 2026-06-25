#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$cookie_jar"
  rm -rf "$verify_dir"
}

trap cleanup EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

reset_cookie_jar() {
  rm -f "$cookie_jar"
  cookie_jar="$(mktemp)"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="$3"
  local expected_status="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

capture_data() {
  local file="$1"
  shift
  pnpm exec convex data "$@" --format json --limit 100 > "$file"
  cat "$file"
  printf '\n'
}

register_client_credentials_client() {
  local label="$1"
  local path="$2"
  local expected_status="$3"
  local response

  response=$(request_json POST "$path" \
    "{\"client_name\":\"$label Client Credentials Client\",\"redirect_uris\":[],\"grant_types\":[\"client_credentials\"],\"response_types\":[],\"scope\":\"project:create\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"client-credentials-limit\",\"mode\":\"$label\"}}" \
    "$expected_status")
  echo "$response" >&2
  printf '%s' "$response"
}

assert_discovery_omits_client_credentials() {
  local label="$1"
  local path="$2"
  local metadata

  metadata=$(curl -sS "http://127.0.0.1:3211$path")
  echo "$metadata"
  printf '%s' "$metadata" | node - "$label" <<'NODE'
const label = process.argv[2]
let input = ''
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  const metadata = JSON.parse(input)
  const grantTypes = metadata.grant_types_supported ?? []
  if (grantTypes.includes('client_credentials')) {
    throw new Error(`${label} discovery unexpectedly advertises client_credentials`)
  }
  if (!grantTypes.includes('authorization_code') || !grantTypes.includes('refresh_token')) {
    throw new Error(`${label} discovery did not advertise expected auth-code/refresh grants`)
  }
})
NODE
}

assert_client_credentials_rejected() {
  local label="$1"
  local token_path="$2"
  local client_id="$3"
  local client_secret="$4"
  local response
  local status
  local payload
  local error
  local error_description

  response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211$token_path" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'Origin: http://localhost:3000' \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "client_secret=$client_secret" \
    --data-urlencode "scope=project:create")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  echo "$payload"
  if [[ "$status" != "400" ]]; then
    echo "$label client_credentials token request returned $status, expected 400" >&2
    exit 1
  fi
  error=$(printf '%s' "$payload" | json_field ".error")
  error_description=$(printf '%s' "$payload" | json_field ".error_description")
  if [[ "$error" != "invalid_request" || "$error_description" != "code is required" ]]; then
    echo "$label client_credentials error was $error / $error_description, expected invalid_request / code is required" >&2
    exit 1
  fi
}

echo "== hard reset for OIDC client_credentials limit"
pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== OIDC discovery omits client_credentials"
assert_discovery_omits_client_credentials "OIDC" /api/auth/convex/.well-known/openid-configuration

echo "== OIDC registration accepts client_credentials metadata"
oidc_registered=$(register_client_credentials_client "oidc" /api/auth/oauth2/register 200)
echo "$oidc_registered"
oidc_client_id=$(printf '%s' "$oidc_registered" | json_field ".client_id")
oidc_client_secret=$(printf '%s' "$oidc_registered" | json_field ".client_secret")
oidc_grant=$(printf '%s' "$oidc_registered" | json_field ".grant_types[0]")
if [[ "$oidc_grant" != "client_credentials" ]]; then
  echo "OIDC registration did not echo client_credentials grant" >&2
  exit 1
fi

echo "== OIDC token endpoint rejects client_credentials"
assert_client_credentials_rejected "OIDC" /api/auth/oauth2/token "$oidc_client_id" "$oidc_client_secret"

echo "== inspect OIDC client_credentials limit tables"
capture_data "$verify_dir/oidc-applications.json" oauthApplication --component betterAuth
capture_data "$verify_dir/oidc-tokens.json" oauthAccessToken --component betterAuth

echo "== hard reset for MCP client_credentials limit"
pnpm exec convex env set BETTER_AUTH_PLATFORM_EXPERIMENT mcp --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== MCP discovery omits client_credentials"
assert_discovery_omits_client_credentials "MCP" /api/auth/.well-known/oauth-authorization-server

echo "== MCP registration accepts client_credentials metadata"
mcp_registered=$(register_client_credentials_client "mcp" /api/auth/mcp/register 201)
echo "$mcp_registered"
mcp_client_id=$(printf '%s' "$mcp_registered" | json_field ".client_id")
mcp_client_secret=$(printf '%s' "$mcp_registered" | json_field ".client_secret")
mcp_grant=$(printf '%s' "$mcp_registered" | json_field ".grant_types[0]")
if [[ "$mcp_grant" != "client_credentials" ]]; then
  echo "MCP registration did not echo client_credentials grant" >&2
  exit 1
fi

echo "== MCP token endpoint rejects client_credentials"
assert_client_credentials_rejected "MCP" /api/auth/mcp/token "$mcp_client_id" "$mcp_client_secret"

echo "== inspect MCP client_credentials limit tables"
capture_data "$verify_dir/mcp-applications.json" oauthApplication --component betterAuth
capture_data "$verify_dir/mcp-tokens.json" oauthAccessToken --component betterAuth

echo "== verify client_credentials limit source-of-truth state"
node - "$verify_dir" "$oidc_client_id" "$mcp_client_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, oidcClientId, mcpClientId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const oidcApplications = parseTable('oidc-applications.json')
const oidcTokens = parseTable('oidc-tokens.json')
const mcpApplications = parseTable('mcp-applications.json')
const mcpTokens = parseTable('mcp-tokens.json')

if (!oidcApplications.some((row) => row.clientId === oidcClientId)) {
  throw new Error('OIDC client_credentials client was not persisted')
}
if (!mcpApplications.some((row) => row.clientId === mcpClientId)) {
  throw new Error('MCP client_credentials client was not persisted')
}
if (oidcTokens.length !== 0) {
  throw new Error('OIDC client_credentials rejection should not create oauthAccessToken rows')
}
if (mcpTokens.length !== 0) {
  throw new Error('MCP client_credentials rejection should not create oauthAccessToken rows')
}
NODE

echo "better-auth OAuth client_credentials limit confirmed"
