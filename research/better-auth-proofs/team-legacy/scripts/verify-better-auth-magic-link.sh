#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="magic-link-$stamp@example.com"
token="local-magic-link-${email//[^a-zA-Z0-9]/-}"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$cookie_jar"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json_post() {
  local path="$1"
  local body="$2"
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
  local path="$1"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X GET "http://127.0.0.1:3211$path" \
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

request_get_failure() {
  local path="$1"
  local expected="$2"
  local response
  local status
  local location
  local payload

  response=$(curl -sS -D - -o /tmp/better-auth-magic-link-replay-body -w '\n%{http_code}' \
    -X GET "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
  status="$(printf '%s' "$response" | tail -n 1)"
  location="$(printf '%s' "$response" | tr -d '\r' | awk 'tolower($1) == "location:" {print $2}' | tail -n 1)"
  payload="$(cat /tmp/better-auth-magic-link-replay-body)"
  rm -f /tmp/better-auth-magic-link-replay-body
  printf '%s\n%s\n' "$location" "$payload"
  if [[ "$status" == "200" ]]; then
    printf 'request unexpectedly succeeded: %s\n%s\n' "$path" "$payload" >&2
    exit 1
  fi
  if [[ "$location" != *"$expected"* && "$payload" != *"$expected"* ]]; then
    printf 'request failed without expected text %s: %s %s\nlocation=%s\n%s\n' "$expected" "$path" "$status" "$location" "$payload" >&2
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

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== send magic link"
sent="$(request_json_post /api/auth/sign-in/magic-link \
  "{\"email\":\"$email\",\"name\":\"Magic Link User\"}")"
echo "$sent"
capture_data "$verify_dir/verification-after-send.json" verification --component betterAuth

echo "== verify magic link"
verified="$(request_json_get "/api/auth/magic-link/verify?token=$token")"
echo "$verified"
user_id="$(printf '%s' "$verified" | json_field ".user.id")"
session_token="$(printf '%s' "$verified" | json_field ".token")"
if [[ -z "$session_token" || "$session_token" == "null" ]]; then
  echo "magic link verification did not return token" >&2
  exit 1
fi
capture_data "$verify_dir/verification-after-verify.json" verification --component betterAuth

echo "== replay magic link is rejected"
request_get_failure "/api/auth/magic-link/verify?token=$token" "INVALID_TOKEN"

capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify magic link state"
node - "$verify_dir" "$token" "$email" "$user_id" "$session_token" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, token, email, userId, sessionToken] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const afterSendRows = parseTable('verification-after-send.json')
const afterVerifyRows = parseTable('verification-after-verify.json')
const betterAuthUsers = parseTable('better-auth-users.json')
const betterAuthSessions = parseTable('better-auth-sessions.json')
const appUsers = parseTable('app-users.json')

if (afterSendRows.length !== 1) throw new Error(`expected one magic-link verification row, got ${afterSendRows.length}`)
const row = afterSendRows[0]
if (row.identifier.includes(token)) throw new Error('raw magic-link token leaked into verification identifier')
if (row.value.includes(token)) throw new Error('raw magic-link token leaked into verification value')
if (!row.value.includes(email)) throw new Error('magic-link verification value should contain target email')
if (afterVerifyRows.length !== 0) throw new Error('magic-link verification row should be consumed after verification')

const user = betterAuthUsers.find((candidate) => candidate._id === userId)
if (!user) throw new Error('magic-link Better Auth user missing')
if (user.email !== email) throw new Error('magic-link user email mismatch')
if (user.emailVerified !== true) throw new Error('magic-link should create a verified user')

const session = betterAuthSessions.find((candidate) => candidate.token === sessionToken)
if (!session) throw new Error('magic-link session missing')
if (session.userId !== userId) throw new Error('magic-link session user mismatch')
if (!appUsers.some((candidate) => candidate.authUserId === userId)) {
  throw new Error('magic-link app user projection missing')
}
NODE

echo "better-auth magic link feedback loop passed"
