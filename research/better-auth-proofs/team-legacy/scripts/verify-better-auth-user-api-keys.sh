#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="user-apikey-owner-$stamp@example.com"
other_email="user-apikey-other-$stamp@example.com"

owner_cookie="$(mktemp)"
other_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$other_cookie"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json() {
  local cookie_jar="$1"
  local path="$2"
  local body="$3"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "200" ]]; then
    printf 'request failed: %s %s\n%s\n' "$path" "$status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

request_json_get() {
  local cookie_jar="$1"
  local path="$2"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -G "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "200" ]]; then
    printf 'request failed: %s %s\n%s\n' "$path" "$status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

request_json_failure() {
  local cookie_jar="$1"
  local path="$2"
  local body="$3"
  local expected="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  printf '%s\n' "$payload"
  if [[ "$status" == "200" ]]; then
    printf 'request unexpectedly succeeded: %s\n%s\n' "$path" "$payload" >&2
    exit 1
  fi
  if [[ "$payload" != *"$expected"* && "$status" != "$expected" ]]; then
    printf 'request failed without expected text %s: %s %s\n%s\n' "$expected" "$path" "$status" "$payload" >&2
    exit 1
  fi
}

convex_data() {
  pnpm exec convex data "$@" --format json --limit 100
}

capture_data() {
  local file="$1"
  shift
  convex_data "$@" > "$file"
  cat "$file"
  printf '\n'
}

convex_run_success() {
  local label="$1"
  local fn="$2"
  local args="$3"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.out"
}

convex_run_success_contains() {
  local label="$1"
  local expected="$2"
  local fn="$3"
  local args="$4"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.out"
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s succeeded without expected text %s\n%s\n' "$label" "$expected" "$output" >&2
    exit 1
  fi
}

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== sign up users"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"User API Key Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
other_signup="$(request_json "$other_cookie" /api/auth/sign-up/email \
  "{\"name\":\"User API Key Other\",\"email\":\"$other_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$other_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
other_id="$(printf '%s' "$other_signup" | json_field ".user.id")"

echo "== owner creates user-owned API key"
created_key="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"user-keys\",\"name\":\"Personal service key\",\"prefix\":\"usr\"}")"
echo "$created_key"
api_key_id="$(printf '%s' "$created_key" | json_field ".id")"
api_key_secret="$(printf '%s' "$created_key" | json_field ".key")"
api_key_reference_id="$(printf '%s' "$created_key" | json_field ".referenceId")"
if [[ "$api_key_reference_id" != "$owner_id" ]]; then
  printf 'user-owned API key referenceId mismatch: %s != %s\n' "$api_key_reference_id" "$owner_id" >&2
  exit 1
fi

echo "== owner can list only their user-owned key"
owner_list="$(request_json_get "$owner_cookie" "/api/auth/api-key/list?configId=user-keys")"
echo "$owner_list"
owner_list_count="$(printf '%s' "$owner_list" | json_field ".apiKeys.length")"
if [[ "$owner_list_count" != "1" ]]; then
  printf 'expected owner to list one user API key, got %s\n%s\n' "$owner_list_count" "$owner_list" >&2
  exit 1
fi

echo "== other user cannot see or delete owner user-owned key"
other_list="$(request_json_get "$other_cookie" "/api/auth/api-key/list?configId=user-keys")"
echo "$other_list"
other_list_count="$(printf '%s' "$other_list" | json_field ".apiKeys.length")"
if [[ "$other_list_count" != "0" ]]; then
  printf 'expected other user to list zero user API keys, got %s\n%s\n' "$other_list_count" "$other_list" >&2
  exit 1
fi
request_json_failure "$other_cookie" /api/auth/api-key/delete \
  "{\"configId\":\"user-keys\",\"keyId\":\"$api_key_id\"}" \
  "KEY_NOT_FOUND"

echo "== server-side Convex verification of raw user API key succeeds"
convex_run_success verify-key apiKeyExperiments:verifyKey \
  "{\"configId\":\"user-keys\",\"key\":\"$api_key_secret\"}"

echo "== inspect active key table state"
capture_data "$verify_dir/api-keys-active.json" apikey --component betterAuth
capture_data "$verify_dir/auth-users.json" user --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify active user API key source-of-truth state"
node - "$verify_dir" "$owner_id" "$other_id" "$api_key_id" "$api_key_secret" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, ownerId, otherId, apiKeyId, apiKeySecret] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const apiKeys = parseTable('api-keys-active.json')
const authUsers = parseTable('auth-users.json')
const appUsers = parseTable('app-users.json')

const ownerKey = apiKeys.find((row) => row._id === apiKeyId)
if (!ownerKey) throw new Error('missing active user API key row')
if (ownerKey.configId !== 'user-keys') throw new Error('user API key configId mismatch')
if (ownerKey.referenceId !== ownerId) throw new Error('user API key must reference owning Better Auth user')
if (ownerKey.key === apiKeySecret) throw new Error('raw API key secret must never be stored in component table')
if (apiKeys.some((row) => row.referenceId === otherId)) throw new Error('other user should have no API key rows')
if (!authUsers.some((row) => row._id === ownerId)) throw new Error('missing owner auth user')
if (!authUsers.some((row) => row._id === otherId)) throw new Error('missing other auth user')
if (!appUsers.some((row) => row.authUserId === ownerId)) throw new Error('missing owner app user projection')
if (!appUsers.some((row) => row.authUserId === otherId)) throw new Error('missing other app user projection')
NODE

echo "== owner deletes user-owned API key"
deleted_key="$(request_json "$owner_cookie" /api/auth/api-key/delete \
  "{\"configId\":\"user-keys\",\"keyId\":\"$api_key_id\"}")"
echo "$deleted_key"

echo "== deleted raw user API key no longer verifies"
convex_run_success_contains verify-deleted-key "INVALID_API_KEY" apiKeyExperiments:verifyKey \
  "{\"configId\":\"user-keys\",\"key\":\"$api_key_secret\"}"

echo "== inspect deleted key table state"
capture_data "$verify_dir/api-keys-deleted.json" apikey --component betterAuth

echo "== verify deleted user API key source-of-truth state"
node - "$verify_dir" "$api_key_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, apiKeyId] = process.argv.slice(2)
const raw = fs.readFileSync(path.join(verifyDir, 'api-keys-deleted.json'), 'utf8')
const apiKeys = raw.includes('There are no documents') || raw.trim().length === 0 ? [] : JSON.parse(raw)

if (apiKeys.some((row) => row._id === apiKeyId)) {
  throw new Error('deleted user API key should not remain in Better Auth component table')
}
NODE

echo "better-auth user API key feedback loop passed"
