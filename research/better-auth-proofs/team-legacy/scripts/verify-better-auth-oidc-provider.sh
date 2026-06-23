#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="oidc-user-$stamp@example.com"
password="password123"
redirect_uri="http://localhost:3000/oidc/callback"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
headers_file="$(mktemp)"
body_file="$(mktemp)"
trap 'rm -f "$cookie_jar" "$headers_file" "$body_file"; rm -rf "$verify_dir"' EXIT

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
pnpm experiment:hard-reset >/dev/null

echo "== OIDC discovery metadata"
metadata=$(curl -sS "http://127.0.0.1:3211/api/auth/convex/.well-known/openid-configuration")
echo "$metadata"
authorization_endpoint=$(printf '%s' "$metadata" | json_field ".authorization_endpoint")
token_endpoint=$(printf '%s' "$metadata" | json_field ".token_endpoint")
userinfo_endpoint=$(printf '%s' "$metadata" | json_field ".userinfo_endpoint")
if [[ "$authorization_endpoint" != "http://localhost:3000/api/auth/oauth2/authorize" ]]; then
  echo "unexpected authorization endpoint: $authorization_endpoint" >&2
  exit 1
fi
if [[ "$token_endpoint" != "http://localhost:3000/api/auth/oauth2/token" ]]; then
  echo "unexpected token endpoint: $token_endpoint" >&2
  exit 1
fi
if [[ "$userinfo_endpoint" != "http://localhost:3000/api/auth/oauth2/userinfo" ]]; then
  echo "unexpected userinfo endpoint: $userinfo_endpoint" >&2
  exit 1
fi

echo "== dynamic client registration writes oauthApplication"
registered=$(request_json POST /api/auth/oauth2/register \
  "{\"client_name\":\"OIDC Dynamic Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"scope\":\"openid profile email\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"feedback\"}}" \
  200)
echo "$registered"
registered_client_id=$(printf '%s' "$registered" | json_field ".client_id")
registered_client_secret=$(printf '%s' "$registered" | json_field ".client_secret")
echo "registered_client_id=$registered_client_id"

echo "== sign up user for dynamic-client auth-code flow"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"OIDC User\",\"email\":\"$email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
user_id=$(printf '%s' "$signup" | json_field ".user.id")
echo "user_id=$user_id"

echo "== authorize dynamic client and request consent"
authorize_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "http://127.0.0.1:3211/api/auth/oauth2/authorize" \
  -H 'Origin: http://localhost:3000' \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=$registered_client_id" \
  --data-urlencode "redirect_uri=$redirect_uri" \
  --data-urlencode "scope=openid profile email offline_access" \
  --data-urlencode "prompt=consent" \
  --data-urlencode "state=oidc-state-$stamp")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$authorize_status" != "302" ]]; then
  echo "expected OIDC authorize to redirect to consent page, got $authorize_status" >&2
  exit 1
fi

location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
consent_code=$(node -e "const url = new URL(process.argv[1], 'http://localhost:3000'); process.stdout.write(url.searchParams.get('consent_code') || '')" "$location")
consent_client_id=$(node -e "const url = new URL(process.argv[1], 'http://localhost:3000'); process.stdout.write(url.searchParams.get('client_id') || '')" "$location")
if [[ -z "$consent_code" ]]; then
  echo "missing consent_code in redirect: $location" >&2
  exit 1
fi
if [[ "$consent_client_id" != "$registered_client_id" ]]; then
  echo "unexpected consent client id in redirect: $location" >&2
  exit 1
fi

echo "== accept OIDC consent"
consent_response=$(request_json POST /api/auth/oauth2/consent \
  "{\"accept\":true,\"consent_code\":\"$consent_code\"}" \
  200)
echo "$consent_response"
redirect_with_code=$(printf '%s' "$consent_response" | json_field ".redirectURI")
code=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('code') || '')" "$redirect_with_code")
state=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$redirect_with_code")
if [[ -z "$code" ]]; then
  echo "missing authorization code in consent response: $consent_response" >&2
  exit 1
fi
if [[ "$state" != "oidc-state-$stamp" ]]; then
  echo "unexpected state in consent response: $consent_response" >&2
  exit 1
fi

echo "== exchange authorization code for tokens"
token_response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211/api/auth/oauth2/token" \
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
  echo "token exchange failed: $token_status" >&2
  exit 1
fi
access_token=$(printf '%s' "$token_payload" | json_field ".access_token")
id_token=$(printf '%s' "$token_payload" | json_field ".id_token")
if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "missing access token" >&2
  exit 1
fi
if [[ -z "$id_token" || "$id_token" == "null" ]]; then
  echo "missing id token" >&2
  exit 1
fi

echo "== userinfo with access token"
userinfo=$(curl -sS -H "Authorization: Bearer $access_token" "http://127.0.0.1:3211/api/auth/oauth2/userinfo")
echo "$userinfo"
userinfo_sub=$(printf '%s' "$userinfo" | json_field ".sub")
if [[ "$userinfo_sub" != "$user_id" ]]; then
  echo "userinfo subject mismatch: $userinfo_sub != $user_id" >&2
  exit 1
fi

echo "== inspect OIDC-owned tables"
capture_data "$verify_dir/oauth-applications.json" oauthApplication --component betterAuth
capture_data "$verify_dir/oauth-access-tokens.json" oauthAccessToken --component betterAuth
capture_data "$verify_dir/oauth-consents.json" oauthConsent --component betterAuth
capture_data "$verify_dir/verifications.json" verification --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify OIDC source-of-truth state"
node - "$verify_dir" "$registered_client_id" "$registered_client_secret" "$user_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, registeredClientId, registeredClientSecret, userId] = process.argv.slice(2)

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
if (!registeredApp) throw new Error('dynamic OIDC client was not written to oauthApplication')
if (registeredApp.clientSecret === registeredClientSecret) {
  throw new Error('dynamic OIDC client secret should be hashed, not stored as the returned raw secret')
}
if (registeredApp.metadata !== '{"source":"feedback"}') {
  throw new Error(`unexpected dynamic OIDC metadata: ${registeredApp.metadata}`)
}
if (!accessTokens.some((row) => row.clientId === registeredClientId && row.userId === userId && row.scopes.includes('openid'))) {
  throw new Error('dynamic-client token exchange did not write oauthAccessToken')
}
if (!appUsers.some((row) => row.authUserId === userId)) {
  throw new Error('Better Auth user projection is missing for OIDC user')
}
if (!consents.some((row) => row.clientId === registeredClientId && row.userId === userId && row.consentGiven === true)) {
  throw new Error('accepted OIDC consent was not written to oauthConsent')
}
if (verifications.length !== 0) {
  throw new Error('authorization code should be consumed from verification table after token exchange')
}
NODE

echo "better-auth OIDC provider feedback loop passed"
