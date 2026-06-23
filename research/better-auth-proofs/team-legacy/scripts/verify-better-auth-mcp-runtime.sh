#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="mcp-user-$stamp@example.com"
password="password123"
redirect_uri="http://localhost:3000/mcp/callback"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
headers_file="$(mktemp)"
body_file="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_PLATFORM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$cookie_jar" "$headers_file" "$body_file"
  rm -rf "$verify_dir"
}

trap cleanup EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
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

echo "== hard reset"
pnpm exec convex env set BETTER_AUTH_PLATFORM_EXPERIMENT mcp --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== MCP OAuth discovery metadata"
metadata=$(curl -sS "http://127.0.0.1:3211/api/auth/.well-known/oauth-authorization-server")
echo "$metadata"
authorization_endpoint=$(printf '%s' "$metadata" | json_field ".authorization_endpoint")
token_endpoint=$(printf '%s' "$metadata" | json_field ".token_endpoint")
registration_endpoint=$(printf '%s' "$metadata" | json_field ".registration_endpoint")
userinfo_endpoint=$(printf '%s' "$metadata" | json_field ".userinfo_endpoint")
jwks_uri=$(printf '%s' "$metadata" | json_field ".jwks_uri")
if [[ "$authorization_endpoint" != "http://localhost:3000/api/auth/mcp/authorize" ]]; then
  echo "unexpected MCP authorization endpoint: $authorization_endpoint" >&2
  exit 1
fi
if [[ "$token_endpoint" != "http://localhost:3000/api/auth/mcp/token" ]]; then
  echo "unexpected MCP token endpoint: $token_endpoint" >&2
  exit 1
fi
if [[ "$registration_endpoint" != "http://localhost:3000/api/auth/mcp/register" ]]; then
  echo "unexpected MCP registration endpoint: $registration_endpoint" >&2
  exit 1
fi

echo "== MCP protected resource metadata"
protected_resource=$(curl -sS "http://127.0.0.1:3211/api/auth/.well-known/oauth-protected-resource")
echo "$protected_resource"
resource=$(printf '%s' "$protected_resource" | json_field ".resource")
authorization_server=$(printf '%s' "$protected_resource" | json_field ".authorization_servers[0]")
if [[ "$resource" != "http://localhost:3000/mcp" ]]; then
  echo "unexpected MCP protected resource: $resource" >&2
  exit 1
fi
if [[ "$authorization_server" != "http://localhost:3000" ]]; then
  echo "unexpected MCP authorization server: $authorization_server" >&2
  exit 1
fi

echo "== advertised MCP userinfo and jwks endpoints are not implemented by installed plugin"
userinfo_status=$(curl -sS -o "$body_file" -w '%{http_code}' -H 'Origin: http://localhost:3000' "http://127.0.0.1:3211/api/auth/mcp/userinfo")
cat "$body_file"
printf '\n'
jwks_status=$(curl -sS -o "$body_file" -w '%{http_code}' -H 'Origin: http://localhost:3000' "http://127.0.0.1:3211/api/auth/mcp/jwks")
cat "$body_file"
printf '\n'
if [[ "$userinfo_status" != "404" ]]; then
  echo "expected advertised MCP userinfo endpoint to be missing in current install, got $userinfo_status" >&2
  exit 1
fi
if [[ "$jwks_status" != "404" ]]; then
  echo "expected advertised MCP jwks endpoint to be missing in current install, got $jwks_status" >&2
  exit 1
fi

echo "== dynamic MCP client registration writes oauthApplication"
registered=$(request_json POST /api/auth/mcp/register \
  "{\"client_name\":\"MCP Dynamic Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"scope\":\"openid profile email offline_access\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"mcp-feedback\"}}" \
  201)
echo "$registered"
registered_client_id=$(printf '%s' "$registered" | json_field ".client_id")
registered_client_secret=$(printf '%s' "$registered" | json_field ".client_secret")
echo "registered_client_id=$registered_client_id"

echo "== sign up user for MCP auth-code flow"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"MCP User\",\"email\":\"$email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
user_id=$(printf '%s' "$signup" | json_field ".user.id")
echo "user_id=$user_id"

echo "== authorize MCP dynamic client and request consent"
authorize_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "http://127.0.0.1:3211/api/auth/mcp/authorize" \
  -H 'Origin: http://localhost:3000' \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=$registered_client_id" \
  --data-urlencode "redirect_uri=$redirect_uri" \
  --data-urlencode "scope=openid profile email offline_access" \
  --data-urlencode "prompt=consent" \
  --data-urlencode "state=mcp-state-$stamp")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$authorize_status" != "302" ]]; then
  echo "expected MCP authorize to redirect to consent page, got $authorize_status" >&2
  exit 1
fi

location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
consent_code=$(node -e "const url = new URL(process.argv[1], 'http://localhost:3000'); process.stdout.write(url.searchParams.get('consent_code') || '')" "$location")
consent_client_id=$(node -e "const url = new URL(process.argv[1], 'http://localhost:3000'); process.stdout.write(url.searchParams.get('client_id') || '')" "$location")
if [[ -z "$consent_code" ]]; then
  echo "missing consent_code in MCP redirect: $location" >&2
  exit 1
fi
if [[ "$consent_client_id" != "$registered_client_id" ]]; then
  echo "unexpected MCP consent client id in redirect: $location" >&2
  exit 1
fi

echo "== accept MCP consent"
consent_response=$(request_json POST /api/auth/oauth2/consent \
  "{\"accept\":true,\"consent_code\":\"$consent_code\"}" \
  200)
echo "$consent_response"
redirect_with_code=$(printf '%s' "$consent_response" | json_field ".redirectURI")
code=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('code') || '')" "$redirect_with_code")
state=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$redirect_with_code")
if [[ -z "$code" ]]; then
  echo "missing MCP authorization code in consent response: $consent_response" >&2
  exit 1
fi
if [[ "$state" != "mcp-state-$stamp" ]]; then
  echo "unexpected MCP state in consent response: $consent_response" >&2
  exit 1
fi

echo "== exchange MCP authorization code for tokens"
token_response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211/api/auth/mcp/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Origin: http://localhost:3000' \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=$code" \
  --data-urlencode "client_id=$registered_client_id" \
  --data-urlencode "client_secret=$registered_client_secret" \
  --data-urlencode "redirect_uri=$redirect_uri")
token_status="$(printf '%s' "$token_response" | tail -n 1)"
token_payload="$(printf '%s' "$token_response" | sed '$d')"
echo "$token_payload"
if [[ "$token_status" != "200" ]]; then
  echo "MCP token exchange failed: $token_status" >&2
  exit 1
fi
access_token=$(printf '%s' "$token_payload" | json_field ".access_token")
refresh_token=$(printf '%s' "$token_payload" | json_field ".refresh_token")
id_token=$(printf '%s' "$token_payload" | json_field ".id_token")
if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "missing MCP access token" >&2
  exit 1
fi
if [[ -z "$refresh_token" || "$refresh_token" == "null" ]]; then
  echo "missing MCP refresh token" >&2
  exit 1
fi
if [[ -z "$id_token" || "$id_token" == "null" ]]; then
  echo "missing MCP id token" >&2
  exit 1
fi

echo "== MCP get-session validates access token"
mcp_session=$(curl -sS -H "Authorization: Bearer $access_token" "http://127.0.0.1:3211/api/auth/mcp/get-session")
echo "$mcp_session"
mcp_session_user_id=$(printf '%s' "$mcp_session" | json_field ".userId")
mcp_session_client_id=$(printf '%s' "$mcp_session" | json_field ".clientId")
if [[ "$mcp_session_user_id" != "$user_id" ]]; then
  echo "MCP get-session user mismatch: $mcp_session_user_id != $user_id" >&2
  exit 1
fi
if [[ "$mcp_session_client_id" != "$registered_client_id" ]]; then
  echo "MCP get-session client mismatch: $mcp_session_client_id != $registered_client_id" >&2
  exit 1
fi

echo "== inspect MCP-owned tables"
capture_data "$verify_dir/oauth-applications.json" oauthApplication --component betterAuth
capture_data "$verify_dir/oauth-access-tokens.json" oauthAccessToken --component betterAuth
capture_data "$verify_dir/oauth-consents.json" oauthConsent --component betterAuth
capture_data "$verify_dir/verifications.json" verification --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify MCP source-of-truth state"
node - "$verify_dir" "$registered_client_id" "$registered_client_secret" "$user_id" "$userinfo_endpoint" "$jwks_uri" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, registeredClientId, registeredClientSecret, userId, userinfoEndpoint, jwksUri] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const applications = parseTable('oauth-applications.json')
const accessTokens = parseTable('oauth-access-tokens.json')
const consents = parseTable('oauth-consents.json')
const verifications = parseTable('verifications.json')
const appUsers = parseTable('app-users.json')

const registeredApp = applications.find((row) => row.clientId === registeredClientId)
if (!registeredApp) throw new Error('dynamic MCP client was not written to oauthApplication')
if (registeredApp.clientSecret !== registeredClientSecret) {
  throw new Error('current MCP plugin behavior changed: client secret is no longer stored as raw plaintext')
}
if (registeredApp.metadata !== '{"source":"mcp-feedback"}') {
  throw new Error(`unexpected dynamic MCP metadata: ${registeredApp.metadata}`)
}
if (!accessTokens.some((row) => row.clientId === registeredClientId && row.userId === userId && row.scopes.includes('openid'))) {
  throw new Error('MCP token exchange did not write oauthAccessToken')
}
if (!appUsers.some((row) => row.authUserId === userId)) {
  throw new Error('Better Auth user projection is missing for MCP user')
}
if (!consents.some((row) => row.clientId === registeredClientId && row.userId === userId && row.consentGiven === true)) {
  throw new Error('accepted MCP consent was not written to oauthConsent')
}
if (verifications.length !== 0) {
  throw new Error('MCP authorization code should be consumed from verification table after token exchange')
}
if (!userinfoEndpoint.endsWith('/api/auth/mcp/userinfo')) {
  throw new Error(`unexpected advertised MCP userinfo endpoint: ${userinfoEndpoint}`)
}
if (!jwksUri.endsWith('/api/auth/mcp/jwks')) {
  throw new Error(`unexpected advertised MCP jwks uri: ${jwksUri}`)
}
NODE

echo "better-auth MCP runtime feedback loop passed with documented endpoint and secret-storage limits"
