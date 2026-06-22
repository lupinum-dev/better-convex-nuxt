#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
admin_email="admin-owner-$stamp@example.com"
regular_email="admin-regular-$stamp@example.com"
created_email="admin-created-$stamp@example.com"

admin_cookie="$(mktemp)"
regular_cookie="$(mktemp)"
impersonation_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'pnpm exec convex env remove BETTER_AUTH_ADMIN_USER_IDS --deployment local >/dev/null 2>&1 || true; rm -f "$admin_cookie" "$regular_cookie" "$impersonation_cookie"; rm -rf "$verify_dir"' EXIT

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

request_get_json() {
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

request_get_failure() {
  local cookie_jar="$1"
  local path="$2"
  local expected="$3"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -G "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
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

echo "== clear test admin env and hard reset"
pnpm exec convex env remove BETTER_AUTH_ADMIN_USER_IDS --deployment local >/dev/null 2>&1 || true
pnpm experiment:hard-reset >/dev/null

echo "== sign up bootstrap admin candidate and regular user"
admin_signup="$(request_json "$admin_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Admin Owner\",\"email\":\"$admin_email\",\"password\":\"$password\"}")"
regular_signup="$(request_json "$regular_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Regular User\",\"email\":\"$regular_email\",\"password\":\"$password\"}")"
echo "$admin_signup"
echo "$regular_signup"
admin_id="$(printf '%s' "$admin_signup" | json_field ".user.id")"
regular_id="$(printf '%s' "$regular_signup" | json_field ".user.id")"

echo "== bootstrap admin rights through local env"
pnpm exec convex env set BETTER_AUTH_ADMIN_USER_IDS "$admin_id" --deployment local >/dev/null
sleep 1

echo "== non-admin cannot list users"
request_get_failure "$regular_cookie" "/api/auth/admin/list-users?limit=20" \
  "YOU_ARE_NOT_ALLOWED_TO_LIST_USERS"

echo "== admin can list users"
listed_users="$(request_get_json "$admin_cookie" "/api/auth/admin/list-users?limit=20")"
echo "$listed_users"

echo "== admin can create a user"
created_user="$(request_json "$admin_cookie" /api/auth/admin/create-user \
  "{\"name\":\"Created By Admin\",\"email\":\"$created_email\",\"password\":\"$password\",\"role\":\"user\"}")"
echo "$created_user"
created_id="$(printf '%s' "$created_user" | json_field ".user.id")"

echo "== admin can set role"
set_role="$(request_json "$admin_cookie" /api/auth/admin/set-role \
  "{\"userId\":\"$created_id\",\"role\":\"admin\"}")"
echo "$set_role"

echo "== admin cannot ban themselves"
request_json_failure "$admin_cookie" /api/auth/admin/ban-user \
  "{\"userId\":\"$admin_id\",\"banReason\":\"self-ban should fail\"}" \
  "YOU_CANNOT_BAN_YOURSELF"

echo "== admin can ban regular user and sign-in is blocked"
banned_user="$(request_json "$admin_cookie" /api/auth/admin/ban-user \
  "{\"userId\":\"$regular_id\",\"banReason\":\"policy test\",\"banExpiresIn\":3600}")"
echo "$banned_user"
request_json_failure "$regular_cookie" /api/auth/sign-in/email \
  "{\"email\":\"$regular_email\",\"password\":\"$password\"}" \
  "BANNED_USER"

echo "== admin can unban regular user and sign-in works again"
unbanned_user="$(request_json "$admin_cookie" /api/auth/admin/unban-user \
  "{\"userId\":\"$regular_id\"}")"
echo "$unbanned_user"
regular_signin="$(request_json "$regular_cookie" /api/auth/sign-in/email \
  "{\"email\":\"$regular_email\",\"password\":\"$password\"}")"
echo "$regular_signin"

echo "== admin can impersonate and stop impersonating"
cp "$admin_cookie" "$impersonation_cookie"
impersonated="$(request_json "$impersonation_cookie" /api/auth/admin/impersonate-user \
  "{\"userId\":\"$regular_id\"}")"
echo "$impersonated"
impersonated_session_id="$(printf '%s' "$impersonated" | json_field ".session.id")"
capture_data "$verify_dir/better-auth-sessions-during-impersonation.json" session --component betterAuth
stopped="$(request_json "$impersonation_cookie" /api/auth/admin/stop-impersonating '{}')"
echo "$stopped"

echo "== inspect admin component rows"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify admin state"
node - "$verify_dir" "$admin_id" "$regular_id" "$created_id" "$impersonated_session_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, adminId, regularId, createdId, impersonatedSessionId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const users = parseTable('better-auth-users.json')
const sessions = parseTable('better-auth-sessions.json')
const sessionsDuringImpersonation = parseTable('better-auth-sessions-during-impersonation.json')
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(users, (row) => row._id === adminId && row.role === 'user', 'bootstrap admin user with default stored role')
has(users, (row) => row._id === regularId && row.banned === false && !row.banReason, 'unbanned regular user')
has(users, (row) => row._id === createdId && row.role === 'admin', 'admin-created promoted user')
has(sessionsDuringImpersonation, (row) => row._id === impersonatedSessionId && row.impersonatedBy === adminId, 'impersonated session')
has(appUsers, (row) => row.authUserId === adminId, 'admin app user projection')
has(appUsers, (row) => row.authUserId === regularId, 'regular app user projection')
has(appUsers, (row) => row.authUserId === createdId, 'admin-created app user projection')

if (sessions.some((row) => row._id === impersonatedSessionId)) {
  throw new Error('stop-impersonating should delete the impersonated session')
}
NODE

echo "better-auth admin feedback loop passed"
