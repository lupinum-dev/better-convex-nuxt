#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
verify_dir="$(mktemp -d)"
headers_file="$(mktemp)"
body_file="$(mktemp)"
cookie_jar="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$headers_file" "$body_file" "$cookie_jar"
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

expect_missing_oauth_endpoint() {
  local label="$1"
  local path="$2"
  local token="$3"
  local status

  status=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'Origin: http://localhost:3000' \
    --data-urlencode "token=$token")
  cat "$body_file"
  printf '\n'
  if [[ "$status" != "404" ]]; then
    echo "expected missing $label endpoint $path to return 404, got $status" >&2
    exit 1
  fi
}

register_client() {
  local label="$1"
  local register_path="$2"
  local expected_status="$3"
  local redirect_uri="$4"
  local response

  response=$(request_json POST "$register_path" \
    "{\"client_name\":\"$label Token Lifecycle Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\",\"refresh_token\"],\"response_types\":[\"code\"],\"scope\":\"openid profile email offline_access project:create\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"token-lifecycle\",\"mode\":\"$label\"}}" \
    "$expected_status")
  echo "$response" >&2
  printf '%s' "$response"
}

authorize_and_exchange() {
  local label="$1"
  local authorize_path="$2"
  local token_path="$3"
  local client_id="$4"
  local client_secret="$5"
  local redirect_uri="$6"
  local state="token-lifecycle-$label-$stamp"
  local authorize_status
  local location
  local consent_code
  local consent_response
  local redirect_with_code
  local code
  local returned_state
  local token_response
  local token_status
  local token_payload

  authorize_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
    "http://127.0.0.1:3211$authorize_path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data-urlencode "response_type=code" \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "redirect_uri=$redirect_uri" \
    --data-urlencode "scope=openid profile email offline_access project:create" \
    --data-urlencode "prompt=consent" \
    --data-urlencode "state=$state")
  cat "$headers_file" >&2
  cat "$body_file" >&2
  printf '\n' >&2
  if [[ "$authorize_status" != "302" ]]; then
    echo "expected $label authorize to redirect to consent page, got $authorize_status" >&2
    exit 1
  fi

  location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
  consent_code=$(node -e "const url = new URL(process.argv[1], 'http://localhost:3000'); process.stdout.write(url.searchParams.get('consent_code') || '')" "$location")
  if [[ -z "$consent_code" ]]; then
    echo "missing consent_code in $label redirect: $location" >&2
    exit 1
  fi

  consent_response=$(request_json POST /api/auth/oauth2/consent \
    "{\"accept\":true,\"consent_code\":\"$consent_code\"}" \
    200)
  echo "$consent_response" >&2
  redirect_with_code=$(printf '%s' "$consent_response" | json_field ".redirectURI")
  code=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('code') || '')" "$redirect_with_code")
  returned_state=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$redirect_with_code")
  if [[ -z "$code" || "$returned_state" != "$state" ]]; then
    echo "invalid $label consent response: $consent_response" >&2
    exit 1
  fi

  token_response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211$token_path" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'Origin: http://localhost:3000' \
    --data-urlencode "grant_type=authorization_code" \
    --data-urlencode "code=$code" \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "client_secret=$client_secret" \
    --data-urlencode "redirect_uri=$redirect_uri")
  token_status="$(printf '%s' "$token_response" | tail -n 1)"
  token_payload="$(printf '%s' "$token_response" | sed '$d')"
  echo "$token_payload" >&2
  if [[ "$token_status" != "200" ]]; then
    echo "$label token exchange failed: $token_status" >&2
    exit 1
  fi
  printf '%s' "$token_payload"
}

refresh_token_grant() {
  local label="$1"
  local token_path="$2"
  local client_id="$3"
  local client_secret="$4"
  local refresh_token="$5"
  local expected_status="$6"
  local token_response
  local token_status
  local token_payload

  token_response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211$token_path" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -H 'Origin: http://localhost:3000' \
    --data-urlencode "grant_type=refresh_token" \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "client_secret=$client_secret" \
    --data-urlencode "refresh_token=$refresh_token")
  token_status="$(printf '%s' "$token_response" | tail -n 1)"
  token_payload="$(printf '%s' "$token_response" | sed '$d')"
  echo "$token_payload" >&2
  if [[ "$token_status" != "$expected_status" ]]; then
    echo "$label refresh returned $token_status, expected $expected_status" >&2
    exit 1
  fi
  printf '%s' "$token_payload"
}

assert_distinct_tokens() {
  local label="$1"
  local first="$2"
  local second="$3"

  if [[ -z "$first" || "$first" == "null" || -z "$second" || "$second" == "null" ]]; then
    echo "$label token was missing" >&2
    exit 1
  fi
  if [[ "$first" == "$second" ]]; then
    echo "$label token did not change" >&2
    exit 1
  fi
}

assert_oidc_userinfo() {
  local label="$1"
  local token="$2"
  local expected_user_id="$3"
  local status
  local subject

  status=$(curl -sS -o "$body_file" -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    "http://127.0.0.1:3211/api/auth/oauth2/userinfo")
  cat "$body_file"
  printf '\n'
  if [[ "$status" != "200" ]]; then
    echo "$label userinfo returned $status, expected 200" >&2
    exit 1
  fi
  subject=$(cat "$body_file" | json_field ".sub")
  if [[ "$subject" != "$expected_user_id" ]]; then
    echo "$label userinfo subject mismatch: $subject != $expected_user_id" >&2
    exit 1
  fi
}

assert_mcp_session() {
  local label="$1"
  local token="$2"
  local expected_user_id="$3"
  local expected_client_id="$4"
  local status
  local user_id
  local client_id

  status=$(curl -sS -o "$body_file" -w '%{http_code}' \
    -H "Authorization: Bearer $token" \
    "http://127.0.0.1:3211/api/auth/mcp/get-session")
  cat "$body_file"
  printf '\n'
  if [[ "$status" != "200" ]]; then
    echo "$label MCP get-session returned $status, expected 200" >&2
    exit 1
  fi
  user_id=$(cat "$body_file" | json_field ".userId")
  client_id=$(cat "$body_file" | json_field ".clientId")
  if [[ "$user_id" != "$expected_user_id" ]]; then
    echo "$label MCP user mismatch: $user_id != $expected_user_id" >&2
    exit 1
  fi
  if [[ "$client_id" != "$expected_client_id" ]]; then
    echo "$label MCP client mismatch: $client_id != $expected_client_id" >&2
    exit 1
  fi
}

echo "== hard reset for OIDC token lifecycle"
pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== issue OIDC auth-code token with offline_access"
oidc_redirect_uri="http://localhost:3000/oidc-token-lifecycle/callback"
oidc_registered=$(register_client "oidc" /api/auth/oauth2/register 200 "$oidc_redirect_uri")
echo "$oidc_registered"
oidc_client_id=$(printf '%s' "$oidc_registered" | json_field ".client_id")
oidc_client_secret=$(printf '%s' "$oidc_registered" | json_field ".client_secret")
oidc_signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"OIDC Token User\",\"email\":\"oidc-token-$stamp@example.com\",\"password\":\"$password\"}" \
  200)
echo "$oidc_signup"
oidc_user_id=$(printf '%s' "$oidc_signup" | json_field ".user.id")
oidc_initial=$(authorize_and_exchange "oidc" /api/auth/oauth2/authorize /api/auth/oauth2/token "$oidc_client_id" "$oidc_client_secret" "$oidc_redirect_uri")
oidc_access_token=$(printf '%s' "$oidc_initial" | json_field ".access_token")
oidc_refresh_token=$(printf '%s' "$oidc_initial" | json_field ".refresh_token")
assert_oidc_userinfo "initial OIDC access token" "$oidc_access_token" "$oidc_user_id"

echo "== refresh OIDC access token"
oidc_refreshed=$(refresh_token_grant "OIDC first" /api/auth/oauth2/token "$oidc_client_id" "$oidc_client_secret" "$oidc_refresh_token" 200)
echo "$oidc_refreshed"
oidc_refreshed_access_token=$(printf '%s' "$oidc_refreshed" | json_field ".access_token")
oidc_refreshed_refresh_token=$(printf '%s' "$oidc_refreshed" | json_field ".refresh_token")
assert_distinct_tokens "OIDC access" "$oidc_access_token" "$oidc_refreshed_access_token"
assert_distinct_tokens "OIDC refresh" "$oidc_refresh_token" "$oidc_refreshed_refresh_token"
assert_oidc_userinfo "new OIDC access token" "$oidc_refreshed_access_token" "$oidc_user_id"

echo "== current OIDC old access and old refresh tokens remain usable"
assert_oidc_userinfo "old OIDC access token after refresh" "$oidc_access_token" "$oidc_user_id"
oidc_reuse=$(refresh_token_grant "OIDC old refresh reuse" /api/auth/oauth2/token "$oidc_client_id" "$oidc_client_secret" "$oidc_refresh_token" 200)
echo "$oidc_reuse"
oidc_reuse_access_token=$(printf '%s' "$oidc_reuse" | json_field ".access_token")
assert_distinct_tokens "OIDC reused-refresh access" "$oidc_refreshed_access_token" "$oidc_reuse_access_token"

echo "== OIDC revocation and introspection endpoints are absent"
expect_missing_oauth_endpoint "OIDC introspection" /api/auth/oauth2/introspect "$oidc_refreshed_access_token"
expect_missing_oauth_endpoint "OIDC revocation" /api/auth/oauth2/revoke "$oidc_refreshed_access_token"

echo "== inspect OIDC token lifecycle tables"
capture_data "$verify_dir/oidc-oauth-access-tokens.json" oauthAccessToken --component betterAuth

echo "== hard reset for MCP token lifecycle"
pnpm exec convex env set BETTER_AUTH_PLATFORM_EXPERIMENT mcp --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== issue MCP auth-code token with offline_access"
mcp_redirect_uri="http://localhost:3000/mcp-token-lifecycle/callback"
mcp_registered=$(register_client "mcp" /api/auth/mcp/register 201 "$mcp_redirect_uri")
echo "$mcp_registered"
mcp_client_id=$(printf '%s' "$mcp_registered" | json_field ".client_id")
mcp_client_secret=$(printf '%s' "$mcp_registered" | json_field ".client_secret")
mcp_signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"MCP Token User\",\"email\":\"mcp-token-$stamp@example.com\",\"password\":\"$password\"}" \
  200)
echo "$mcp_signup"
mcp_user_id=$(printf '%s' "$mcp_signup" | json_field ".user.id")
mcp_initial=$(authorize_and_exchange "mcp" /api/auth/mcp/authorize /api/auth/mcp/token "$mcp_client_id" "$mcp_client_secret" "$mcp_redirect_uri")
mcp_access_token=$(printf '%s' "$mcp_initial" | json_field ".access_token")
mcp_refresh_token=$(printf '%s' "$mcp_initial" | json_field ".refresh_token")
assert_mcp_session "initial MCP access token" "$mcp_access_token" "$mcp_user_id" "$mcp_client_id"

echo "== refresh MCP access token"
mcp_refreshed=$(refresh_token_grant "MCP first" /api/auth/mcp/token "$mcp_client_id" "$mcp_client_secret" "$mcp_refresh_token" 200)
echo "$mcp_refreshed"
mcp_refreshed_access_token=$(printf '%s' "$mcp_refreshed" | json_field ".access_token")
mcp_refreshed_refresh_token=$(printf '%s' "$mcp_refreshed" | json_field ".refresh_token")
assert_distinct_tokens "MCP access" "$mcp_access_token" "$mcp_refreshed_access_token"
assert_distinct_tokens "MCP refresh" "$mcp_refresh_token" "$mcp_refreshed_refresh_token"
assert_mcp_session "new MCP access token" "$mcp_refreshed_access_token" "$mcp_user_id" "$mcp_client_id"

echo "== current MCP old access and old refresh tokens remain usable"
assert_mcp_session "old MCP access token after refresh" "$mcp_access_token" "$mcp_user_id" "$mcp_client_id"
mcp_reuse=$(refresh_token_grant "MCP old refresh reuse" /api/auth/mcp/token "$mcp_client_id" "$mcp_client_secret" "$mcp_refresh_token" 200)
echo "$mcp_reuse"
mcp_reuse_access_token=$(printf '%s' "$mcp_reuse" | json_field ".access_token")
assert_distinct_tokens "MCP reused-refresh access" "$mcp_refreshed_access_token" "$mcp_reuse_access_token"

echo "== MCP revocation and introspection endpoints are absent"
expect_missing_oauth_endpoint "MCP introspection" /api/auth/mcp/introspect "$mcp_refreshed_access_token"
expect_missing_oauth_endpoint "MCP revocation" /api/auth/mcp/revoke "$mcp_refreshed_access_token"

echo "== inspect MCP token lifecycle tables"
capture_data "$verify_dir/mcp-oauth-access-tokens.json" oauthAccessToken --component betterAuth

echo "== verify token lifecycle source-of-truth state"
node - "$verify_dir" "$oidc_client_id" "$oidc_user_id" "$oidc_refresh_token" "$oidc_refreshed_refresh_token" "$mcp_client_id" "$mcp_user_id" "$mcp_refresh_token" "$mcp_refreshed_refresh_token" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  oidcClientId,
  oidcUserId,
  oidcOriginalRefresh,
  oidcNewRefresh,
  mcpClientId,
  mcpUserId,
  mcpOriginalRefresh,
  mcpNewRefresh,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const oidcTokens = parseTable('oidc-oauth-access-tokens.json')
const mcpTokens = parseTable('mcp-oauth-access-tokens.json')

const countFor = (rows, clientId, userId) =>
  rows.filter((row) => row.clientId === clientId && row.userId === userId)

const oidcRows = countFor(oidcTokens, oidcClientId, oidcUserId)
if (oidcRows.length !== 3) {
  throw new Error(`expected 3 OIDC token rows after initial refresh and old-refresh reuse, got ${oidcRows.length}`)
}
if (!oidcRows.some((row) => row.refreshToken === oidcOriginalRefresh)) {
  throw new Error('original OIDC refresh token row remains expected in current installed behavior')
}
if (!oidcRows.some((row) => row.refreshToken === oidcNewRefresh)) {
  throw new Error('new OIDC refresh token row is missing')
}

const mcpRows = countFor(mcpTokens, mcpClientId, mcpUserId)
if (mcpRows.length !== 3) {
  throw new Error(`expected 3 MCP token rows after initial refresh and old-refresh reuse, got ${mcpRows.length}`)
}
if (!mcpRows.some((row) => row.refreshToken === mcpOriginalRefresh)) {
  throw new Error('original MCP refresh token row remains expected in current installed behavior')
}
if (!mcpRows.some((row) => row.refreshToken === mcpNewRefresh)) {
  throw new Error('new MCP refresh token row is missing')
}
NODE

echo "better-auth OAuth token lifecycle feedback loop passed with documented refresh-token reuse and missing revoke/introspect limits"
