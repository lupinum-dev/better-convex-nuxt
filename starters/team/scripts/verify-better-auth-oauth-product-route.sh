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
  pnpm exec convex data "$@" --format json --limit 50 > "$file"
  cat "$file"
  printf '\n'
}

create_org_for_current_user() {
  local label="$1"
  local slug="$2"
  local response

  response=$(request_json POST /api/auth/organization/create \
    "{\"name\":\"$label Org\",\"slug\":\"$slug\",\"plan\":\"team\",\"region\":\"eu\"}" \
    200)
  echo "$response"
  printf '%s' "$response" | json_field ".id"
}

issue_oidc_token() {
  local label="$1"
  local redirect_uri="$2"
  local scope="$3"
  local register_path="$4"
  local register_status="$5"
  local authorize_path="$6"
  local token_path="$7"
  local state="oauth-product-$label-$stamp"

  registered=$(request_json POST "$register_path" \
    "{\"client_name\":\"$label Product Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"scope\":\"$scope\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"oauth-product\",\"mode\":\"$label\"}}" \
    "$register_status")
  echo "$registered"
  client_id=$(printf '%s' "$registered" | json_field ".client_id")
  client_secret=$(printf '%s' "$registered" | json_field ".client_secret")

  authorize_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
    "http://127.0.0.1:3211$authorize_path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data-urlencode "response_type=code" \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "redirect_uri=$redirect_uri" \
    --data-urlencode "scope=$scope" \
    --data-urlencode "prompt=consent" \
    --data-urlencode "state=$state")
  cat "$headers_file"
  cat "$body_file"
  printf '\n'
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
  echo "$consent_response"
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
  echo "$token_payload"
  if [[ "$token_status" != "200" ]]; then
    echo "$label token exchange failed: $token_status" >&2
    exit 1
  fi
  printf '%s' "$token_payload" | json_field ".access_token"
}

call_oauth_project_route() {
  local token="$1"
  local organization_id="$2"
  local name="$3"
  local expected_status="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211/api/oauth-projects" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://localhost:3000' \
    -H "Authorization: Bearer $token" \
    --data "{\"organizationId\":\"$organization_id\",\"name\":\"$name\"}")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  echo "$payload"
  if [[ "$status" != "$expected_status" ]]; then
    echo "OAuth project route returned $status, expected $expected_status" >&2
    exit 1
  fi
}

echo "== hard reset for OIDC product route"
pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== sign up OIDC owner and create org"
oidc_email="oauth-product-oidc-$stamp@example.com"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"OIDC Product Owner\",\"email\":\"$oidc_email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
oidc_user_id=$(printf '%s' "$signup" | json_field ".user.id")
oidc_org_id=$(create_org_for_current_user "OIDC Product" "oauth-product-oidc-$stamp" | tail -n 1)
echo "oidc_user_id=$oidc_user_id"
echo "oidc_org_id=$oidc_org_id"

echo "== issue OIDC token with project:create and create product row"
oidc_token=$(issue_oidc_token "oidc" "http://localhost:3000/oidc-product/callback" "openid profile email offline_access project:create" /api/auth/oauth2/register 200 /api/auth/oauth2/authorize /api/auth/oauth2/token | tail -n 1)
call_oauth_project_route "$oidc_token" "$oidc_org_id" "OIDC OAuth Project" 200

echo "== issue OIDC token without project:create and verify route denial"
oidc_read_token=$(issue_oidc_token "oidc-readonly" "http://localhost:3000/oidc-product-readonly/callback" "openid profile email" /api/auth/oauth2/register 200 /api/auth/oauth2/authorize /api/auth/oauth2/token | tail -n 1)
call_oauth_project_route "$oidc_read_token" "$oidc_org_id" "OIDC Should Fail" 403

echo "== hard reset for MCP product route"
pnpm exec convex env set BETTER_AUTH_PLATFORM_EXPERIMENT mcp --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null
reset_cookie_jar

echo "== sign up MCP owner and create org"
mcp_email="oauth-product-mcp-$stamp@example.com"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"MCP Product Owner\",\"email\":\"$mcp_email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
mcp_user_id=$(printf '%s' "$signup" | json_field ".user.id")
mcp_org_id=$(create_org_for_current_user "MCP Product" "oauth-product-mcp-$stamp" | tail -n 1)
echo "mcp_user_id=$mcp_user_id"
echo "mcp_org_id=$mcp_org_id"

echo "== issue MCP token with project:create and create product row"
mcp_token=$(issue_oidc_token "mcp" "http://localhost:3000/mcp-product/callback" "openid profile email offline_access project:create" /api/auth/mcp/register 201 /api/auth/mcp/authorize /api/auth/mcp/token | tail -n 1)
call_oauth_project_route "$mcp_token" "$mcp_org_id" "MCP OAuth Project" 200

echo "== invalid bearer token is rejected"
call_oauth_project_route "not-a-real-token" "$mcp_org_id" "Invalid Token Project" 401

echo "== inspect OAuth product route state"
capture_data "$verify_dir/oauth-access-tokens.json" oauthAccessToken --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit.json" auditEvents

echo "== verify OAuth product route source-of-truth state"
node - "$verify_dir" "$mcp_user_id" "$mcp_org_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, userId, organizationId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const tokens = parseTable('oauth-access-tokens.json')
const members = parseTable('members.json')
const projects = parseTable('projects.json')
const audit = parseTable('audit.json')

if (!tokens.some((row) => row.userId === userId && row.scopes.includes('project:create'))) {
  throw new Error('MCP project:create OAuth token was not persisted')
}
if (!members.some((row) => row.userId === userId && row.organizationId === organizationId)) {
  throw new Error('MCP organization membership was not persisted in Better Auth component')
}
if (!projects.some((row) => row.organizationId === organizationId && row.name === 'MCP OAuth Project')) {
  throw new Error('MCP OAuth product route did not create a project')
}
if (!audit.some((row) => row.action === 'projects.createFromOAuthToken')) {
  throw new Error('OAuth product route audit event is missing')
}
if (projects.some((row) => row.name === 'Invalid Token Project' || row.name === 'OIDC Should Fail')) {
  throw new Error('denied OAuth route request created a project')
}
NODE

echo "better-auth OAuth product route feedback loop passed"
