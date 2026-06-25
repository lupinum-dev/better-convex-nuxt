#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
code="generic-code-$stamp"
callback_url="http://localhost:3000/oauth/generic-done"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
headers_file="$(mktemp)"
body_file="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT --deployment local >/dev/null 2>&1 || true
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
  pnpm exec convex data "$@" --format json --limit 100 > "$file"
  cat "$file"
  printf '\n'
}

echo "== enable generic OAuth experiment and hard reset"
pnpm exec convex env set BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT true --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== start generic OAuth sign-in"
signin="$(request_json POST /api/auth/sign-in/oauth2 \
  "{\"providerId\":\"local-generic-oauth\",\"callbackURL\":\"$callback_url\",\"disableRedirect\":true,\"requestSignUp\":true,\"scopes\":[\"profile\",\"email\"],\"additionalData\":{\"trace\":\"generic-oauth-$stamp\"}}" \
  200)"
echo "$signin"
auth_url="$(printf '%s' "$signin" | json_field ".url")"
redirect="$(printf '%s' "$signin" | json_field ".redirect")"
if [[ "$redirect" != "false" ]]; then
  echo "expected disableRedirect response redirect=false" >&2
  exit 1
fi

provider_host="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.origin)" "$auth_url")"
client_id="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('client_id') || '')" "$auth_url")"
redirect_uri="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('redirect_uri') || '')" "$auth_url")"
state="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$auth_url")"
scope="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('scope') || '')" "$auth_url")"
if [[ "$provider_host" != "http://localhost:3999" ]]; then
  echo "unexpected generic OAuth authorization host: $provider_host" >&2
  exit 1
fi
if [[ "$client_id" != "local-generic-client" ]]; then
  echo "unexpected generic OAuth client id: $client_id" >&2
  exit 1
fi
if [[ "$redirect_uri" != "http://localhost:3000/api/auth/oauth2/callback/local-generic-oauth" ]]; then
  echo "unexpected generic OAuth redirect_uri: $redirect_uri" >&2
  exit 1
fi
if [[ -z "$state" ]]; then
  echo "missing generic OAuth state" >&2
  exit 1
fi
if [[ "$scope" != *"profile"* || "$scope" != *"email"* ]]; then
  echo "expected profile and email scopes in generic OAuth URL: $scope" >&2
  exit 1
fi

echo "== inspect OAuth state before callback"
capture_data "$verify_dir/verifications-before-callback.json" verification --component betterAuth

echo "== complete generic OAuth callback with local provider code"
callback_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "http://127.0.0.1:3211/api/auth/oauth2/callback/local-generic-oauth" \
  -H 'Origin: http://localhost:3000' \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "code=$code" \
  --data-urlencode "state=$state")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$callback_status" != "302" ]]; then
  echo "expected generic OAuth callback redirect, got $callback_status" >&2
  exit 1
fi
location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
if [[ "$location" != "$callback_url" ]]; then
  echo "unexpected generic OAuth callback redirect: $location" >&2
  exit 1
fi

echo "== get session after generic OAuth callback"
session="$(curl -sS -H 'Origin: http://localhost:3000' -b "$cookie_jar" -c "$cookie_jar" \
  "http://127.0.0.1:3211/api/auth/get-session")"
echo "$session"
user_id="$(printf '%s' "$session" | json_field ".user.id")"
session_user_email="$(printf '%s' "$session" | json_field ".user.email")"
expected_email="generic-oauth-$code@example.com"
if [[ "$session_user_email" != "$expected_email" ]]; then
  echo "unexpected generic OAuth session email: $session_user_email" >&2
  exit 1
fi

echo "== replaying the consumed state is rejected"
replay_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "http://127.0.0.1:3211/api/auth/oauth2/callback/local-generic-oauth" \
  -H 'Origin: http://localhost:3000' \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "code=$code" \
  --data-urlencode "state=$state")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$replay_status" != "302" ]]; then
  echo "expected generic OAuth replay to redirect with an error, got $replay_status" >&2
  exit 1
fi
replay_location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
if [[ "$replay_location" != *"state_mismatch"* ]]; then
  echo "expected generic OAuth replay to include state_mismatch: $replay_location" >&2
  exit 1
fi

echo "== inspect generic OAuth source-of-truth tables"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-accounts.json" account --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/verifications-after-callback.json" verification --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify generic OAuth source-of-truth state"
node - "$verify_dir" "$state" "$code" "$user_id" "$expected_email" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, state, code, userId, expectedEmail] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '' || raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const verificationsBefore = parseTable('verifications-before-callback.json')
const users = parseTable('better-auth-users.json')
const accounts = parseTable('better-auth-accounts.json')
const sessions = parseTable('better-auth-sessions.json')
const verificationsAfter = parseTable('verifications-after-callback.json')
const appUsers = parseTable('app-users.json')

if (!verificationsBefore.some((row) => row.identifier === state)) {
  throw new Error('missing generic OAuth state verification row before callback')
}
if (verificationsAfter.some((row) => row.identifier === state)) {
  throw new Error('generic OAuth state verification row was not consumed')
}

const user = users.find((row) => row._id === userId)
if (!user) throw new Error('missing generic OAuth Better Auth user')
if (user.email !== expectedEmail) throw new Error('generic OAuth user email mismatch')
if (user.emailVerified !== true) throw new Error('generic OAuth user should be email-verified')
if (user.name !== 'Generic OAuth User') throw new Error('generic OAuth user name mismatch')

const account = accounts.find(
  (row) => row.userId === userId && row.providerId === 'local-generic-oauth'
)
if (!account) throw new Error('missing generic OAuth account row')
if (account.accountId !== `local-generic-sub-${code}`) throw new Error('generic OAuth account id mismatch')
if (account.accessToken !== `local-generic-access-${code}`) throw new Error('generic OAuth access token mismatch')
if (account.refreshToken !== `local-generic-refresh-${code}`) throw new Error('generic OAuth refresh token mismatch')
if (account.scope !== 'profile,email') throw new Error(`generic OAuth scope mismatch: ${account.scope}`)
if (typeof account.accessTokenExpiresAt !== 'number') throw new Error('missing access token expiry')
if (typeof account.refreshTokenExpiresAt !== 'number') throw new Error('missing refresh token expiry')

if (!sessions.some((row) => row.userId === userId)) {
  throw new Error('missing generic OAuth session row')
}
if (!appUsers.some((row) => row.authUserId === userId && row.email === expectedEmail)) {
  throw new Error('missing app user projection for generic OAuth user')
}
NODE

echo "better-auth generic OAuth feedback loop passed"
