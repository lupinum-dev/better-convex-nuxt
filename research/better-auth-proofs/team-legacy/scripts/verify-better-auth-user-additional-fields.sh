#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="additional-fields-$stamp@example.com"
password="password123"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$cookie_jar"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response
  local status
  local payload

  if [[ "$method" == "GET" ]]; then
    response=$(curl -sS -w '\n%{http_code}' "http://127.0.0.1:3211$path" \
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
  if [[ "$status" != "200" ]]; then
    printf 'request failed: %s %s %s\n%s\n' "$method" "$path" "$status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
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

echo "== sign up user with Better Auth additional fields"
signup="$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"Additional Fields User\",\"email\":\"$email\",\"password\":\"$password\",\"locale\":\"de-AT\",\"timezone\":\"Europe/Vienna\",\"marketingOptIn\":true}")"
echo "$signup"
user_id="$(printf '%s' "$signup" | json_field ".user.id")"
echo "user_id=$user_id"

echo "== get session with additional fields"
session="$(request_json GET /api/auth/get-session)"
echo "$session"
printf '%s' "$session" > "$verify_dir/session.json"

echo "== inspect Better Auth and app user rows"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/app-users.json" users
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth

echo "== verify additional field source-of-truth state"
node - "$verify_dir" "$user_id" "$email" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, userId, email] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const session = JSON.parse(fs.readFileSync(path.join(verifyDir, 'session.json'), 'utf8'))
const authUsers = parseTable('better-auth-users.json')
const appUsers = parseTable('app-users.json')
const sessions = parseTable('better-auth-sessions.json')

const authUser = authUsers.find((row) => row._id === userId)
if (!authUser) throw new Error('missing Better Auth user row')
if (authUser.email !== email) throw new Error('Better Auth user email mismatch')
if (authUser.locale !== 'de-AT') throw new Error('Better Auth user locale was not stored')
if (authUser.timezone !== 'Europe/Vienna') throw new Error('Better Auth user timezone was not stored')
if (authUser.marketingOptIn !== true) throw new Error('Better Auth user marketingOptIn was not stored')

if (session.user?.id !== userId) throw new Error('session user id mismatch')
if (session.user?.locale !== 'de-AT') throw new Error('session response did not include locale')
if (session.user?.timezone !== 'Europe/Vienna') throw new Error('session response did not include timezone')
if (session.user?.marketingOptIn !== true) {
  throw new Error('session response did not include marketingOptIn')
}

const appUser = appUsers.find((row) => row.authUserId === userId)
if (!appUser) throw new Error('missing rebuildable app user projection')
if (appUser.email !== email) throw new Error('app user projection email mismatch')
for (const field of ['locale', 'timezone', 'marketingOptIn']) {
  if (Object.hasOwn(appUser, field)) {
    throw new Error(`app user projection should not mirror ${field}`)
  }
}

if (!sessions.some((row) => row.userId === userId)) {
  throw new Error('missing Better Auth session row')
}
NODE

echo "better-auth user additional-fields feedback loop passed"
