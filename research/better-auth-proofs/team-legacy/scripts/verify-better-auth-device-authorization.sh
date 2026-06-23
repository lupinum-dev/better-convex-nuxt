#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="device-auth-$stamp@example.com"
password="password123"
client_id="team-device-client"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$cookie_jar"; rm -rf "$verify_dir"' EXIT

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

  if [[ "$method" == "GET" ]]; then
    response=$(curl -sS -w '\n%{http_code}' -X GET "http://127.0.0.1:3211$path" \
      -H 'Origin: http://localhost:3000' \
      -b "$cookie_jar" \
      -c "$cookie_jar")
  else
    response=$(curl -sS -w '\n%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
      -H 'Content-Type: application/json' \
      -H 'Origin: http://localhost:3000' \
      -b "$cookie_jar" \
      -c "$cookie_jar" \
      --data "$body")
  fi

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

echo "== invalid device client is rejected"
invalid_client=$(request_json POST /api/auth/device/code \
  '{"client_id":"invalid-device-client","scope":"openid profile"}' \
  400)
echo "$invalid_client"
invalid_error=$(printf '%s' "$invalid_client" | json_field ".error")
if [[ "$invalid_error" != "invalid_client" ]]; then
  echo "expected invalid_client, got $invalid_error" >&2
  exit 1
fi

echo "== request approval device code"
approval_code_response=$(request_json POST /api/auth/device/code \
  "{\"client_id\":\"$client_id\",\"scope\":\"openid profile email\"}" \
  200)
echo "$approval_code_response"
approval_device_code=$(printf '%s' "$approval_code_response" | json_field ".device_code")
approval_user_code=$(printf '%s' "$approval_code_response" | json_field ".user_code")
approval_verify_uri=$(printf '%s' "$approval_code_response" | json_field ".verification_uri")
approval_verify_complete=$(printf '%s' "$approval_code_response" | json_field ".verification_uri_complete")
if [[ "$approval_verify_uri" != "http://localhost:3000/device" ]]; then
  echo "unexpected verification uri: $approval_verify_uri" >&2
  exit 1
fi
if [[ "$approval_verify_complete" != "http://localhost:3000/device?user_code=$approval_user_code" ]]; then
  echo "unexpected verification complete uri: $approval_verify_complete" >&2
  exit 1
fi

echo "== pending token request is rejected"
pending_token=$(request_json POST /api/auth/device/token \
  "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$approval_device_code\",\"client_id\":\"$client_id\"}" \
  400)
echo "$pending_token"
pending_error=$(printf '%s' "$pending_token" | json_field ".error")
if [[ "$pending_error" != "authorization_pending" ]]; then
  echo "expected authorization_pending, got $pending_error" >&2
  exit 1
fi

echo "== sign up verifier user"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"Device Auth User\",\"email\":\"$email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
user_id=$(printf '%s' "$signup" | json_field ".user.id")
echo "user_id=$user_id"

echo "== signed-in user claims device code"
claim_response=$(request_json GET "/api/auth/device?user_code=$approval_user_code" "" 200)
echo "$claim_response"
claim_status=$(printf '%s' "$claim_response" | json_field ".status")
if [[ "$claim_status" != "pending" ]]; then
  echo "expected pending claim status, got $claim_status" >&2
  exit 1
fi

echo "== inspect claimed pending row"
capture_data "$verify_dir/device-pending.json" deviceCode --component betterAuth

node - "$verify_dir/device-pending.json" "$approval_device_code" "$approval_user_code" "$user_id" <<'NODE'
const fs = require('node:fs')

const [file, deviceCode, userCode, userId] = process.argv.slice(2)
const raw = fs.readFileSync(file, 'utf8')
const rows = raw.includes('There are no documents') ? [] : JSON.parse(raw)
const row = rows.find((item) => item.deviceCode === deviceCode)
if (!row) throw new Error('pending deviceCode row missing')
if (row.userCode !== userCode) throw new Error('pending deviceCode userCode mismatch')
if (row.userId !== userId) throw new Error('pending deviceCode was not claimed by signed-in user')
if (row.status !== 'pending') throw new Error(`expected pending status, got ${row.status}`)
if (row.clientId !== 'team-device-client') throw new Error(`unexpected clientId ${row.clientId}`)
if (row.scope !== 'openid profile email') throw new Error(`unexpected scope ${row.scope}`)
NODE

echo "== approve device code"
approved=$(request_json POST /api/auth/device/approve \
  "{\"userCode\":\"$approval_user_code\"}" \
  200)
echo "$approved"

echo "== inspect approved row"
capture_data "$verify_dir/device-approved.json" deviceCode --component betterAuth

node - "$verify_dir/device-approved.json" "$approval_device_code" "$user_id" <<'NODE'
const fs = require('node:fs')

const [file, deviceCode, userId] = process.argv.slice(2)
const raw = fs.readFileSync(file, 'utf8')
const rows = raw.includes('There are no documents') ? [] : JSON.parse(raw)
const row = rows.find((item) => item.deviceCode === deviceCode)
if (!row) throw new Error('approved deviceCode row missing')
if (row.userId !== userId) throw new Error('approved deviceCode user mismatch')
if (row.status !== 'approved') throw new Error(`expected approved status, got ${row.status}`)
NODE

echo "== exchange approved device code for token"
sleep 1
token_response=$(request_json POST /api/auth/device/token \
  "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$approval_device_code\",\"client_id\":\"$client_id\"}" \
  200)
echo "$token_response"
access_token=$(printf '%s' "$token_response" | json_field ".access_token")
if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "missing device access token" >&2
  exit 1
fi

echo "== request denial device code"
denial_code_response=$(request_json POST /api/auth/device/code \
  "{\"client_id\":\"$client_id\",\"scope\":\"openid\"}" \
  200)
echo "$denial_code_response"
denial_device_code=$(printf '%s' "$denial_code_response" | json_field ".device_code")
denial_user_code=$(printf '%s' "$denial_code_response" | json_field ".user_code")

echo "== claim and deny device code"
denial_claim=$(request_json GET "/api/auth/device?user_code=$denial_user_code" "" 200)
echo "$denial_claim"
denied=$(request_json POST /api/auth/device/deny \
  "{\"userCode\":\"$denial_user_code\"}" \
  200)
echo "$denied"

echo "== denied token request fails and consumes row"
denied_token=$(request_json POST /api/auth/device/token \
  "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$denial_device_code\",\"client_id\":\"$client_id\"}" \
  400)
echo "$denied_token"
denied_error=$(printf '%s' "$denied_token" | json_field ".error")
if [[ "$denied_error" != "access_denied" ]]; then
  echo "expected access_denied, got $denied_error" >&2
  exit 1
fi

echo "== inspect final device/session/app state"
capture_data "$verify_dir/device-final.json" deviceCode --component betterAuth
capture_data "$verify_dir/sessions.json" session --component betterAuth
capture_data "$verify_dir/users.json" user --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify device authorization source-of-truth state"
node - "$verify_dir" "$approval_device_code" "$denial_device_code" "$access_token" "$user_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, approvalDeviceCode, denialDeviceCode, accessToken, userId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const deviceRows = parseTable('device-final.json')
const sessions = parseTable('sessions.json')
const users = parseTable('users.json')
const appUsers = parseTable('app-users.json')

if (deviceRows.some((row) => row.deviceCode === approvalDeviceCode)) {
  throw new Error('approved deviceCode row should be consumed after token exchange')
}
if (deviceRows.some((row) => row.deviceCode === denialDeviceCode)) {
  throw new Error('denied deviceCode row should be consumed after denied token request')
}
if (!sessions.some((row) => row.token === accessToken && row.userId === userId)) {
  throw new Error('device token exchange did not create expected Better Auth session')
}
if (!users.some((row) => row._id === userId)) {
  throw new Error('Better Auth user missing after device flow')
}
if (!appUsers.some((row) => row.authUserId === userId)) {
  throw new Error('app user projection missing after device flow')
}
NODE

echo "better-auth device authorization feedback loop passed"
