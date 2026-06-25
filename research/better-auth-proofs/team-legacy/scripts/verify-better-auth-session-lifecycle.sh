#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="session-lifecycle-owner-$stamp@example.com"
org_slug="session-lifecycle-org-$stamp"

primary_cookie="$(mktemp)"
secondary_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$primary_cookie" "$secondary_cookie"; rm -rf "$verify_dir"' EXIT

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

get_json() {
  local cookie_jar="$1"
  local path="$2"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
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

convex_run_success() {
  local label="$1"
  local fn="$2"
  local args="$3"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.out"
}

convex_run_failure() {
  local label="$1"
  local expected="$2"
  local fn="$3"
  local args="$4"
  local output
  local status

  set +e
  output="$(pnpm exec convex run "$fn" "$args" 2>&1)"
  status="$?"
  set -e
  printf '%s\n' "$output"
  if [[ "$status" == "0" ]]; then
    printf '%s unexpectedly succeeded\n' "$label" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s failed without expected text %s\n%s\n' "$label" "$expected" "$output" >&2
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

last_json_string() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const line = input.trim().split(/\n/).filter(Boolean).at(-1); process.stdout.write(JSON.parse(line)); })"
}

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== sign up primary session"
primary_signup="$(request_json "$primary_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Session Lifecycle Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
echo "$primary_signup"
owner_id="$(printf '%s' "$primary_signup" | json_field ".user.id")"
primary_token="$(printf '%s' "$primary_signup" | json_field ".token")"
echo "owner_id=$owner_id"

echo "== sign in second browser session"
secondary_signin="$(request_json "$secondary_cookie" /api/auth/sign-in/email \
  "{\"email\":\"$owner_email\",\"password\":\"$password\"}")"
echo "$secondary_signin"
secondary_token="$(printf '%s' "$secondary_signin" | json_field ".token")"

echo "== create organization with primary session"
organization="$(request_json "$primary_cookie" /api/auth/organization/create \
  "{\"name\":\"Session Lifecycle Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== both sessions can authorize product writes before revocation"
primary_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Primary Before Revocation\",\"sessionTokenForExperiment\":\"$primary_token\"}"
secondary_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Secondary Before Revocation\",\"sessionTokenForExperiment\":\"$secondary_token\"}"
convex_run_success primary-create-before-revoke productAuthExperiments:createProject "$primary_create_args"
convex_run_success secondary-create-before-revoke productAuthExperiments:createProject "$secondary_create_args"
primary_before_project_id="$(cat "$verify_dir/primary-create-before-revoke.out" | last_json_string)"
secondary_before_project_id="$(cat "$verify_dir/secondary-create-before-revoke.out" | last_json_string)"
echo "primary_before_project_id=$primary_before_project_id"
echo "secondary_before_project_id=$secondary_before_project_id"

echo "== list active sessions"
sessions_before="$(get_json "$primary_cookie" /api/auth/list-sessions)"
echo "$sessions_before"
printf '%s' "$sessions_before" > "$verify_dir/sessions-before.json"

echo "== revoke second session from primary session"
revoked="$(request_json "$primary_cookie" /api/auth/revoke-session \
  "{\"token\":\"$secondary_token\"}")"
echo "$revoked"

echo "== revoked secondary token no longer authorizes product writes"
secondary_after_revoke_args="{\"organizationId\":\"$organization_id\",\"name\":\"Secondary After Revoke Should Fail\",\"sessionTokenForExperiment\":\"$secondary_token\"}"
convex_run_failure secondary-create-after-revoke "Unauthenticated" productAuthExperiments:createProject "$secondary_after_revoke_args"

echo "== primary session still authorizes after revoking another session"
primary_after_revoke_args="{\"organizationId\":\"$organization_id\",\"name\":\"Primary After Revoke\",\"sessionTokenForExperiment\":\"$primary_token\"}"
convex_run_success primary-create-after-revoke productAuthExperiments:createProject "$primary_after_revoke_args"
primary_after_revoke_project_id="$(cat "$verify_dir/primary-create-after-revoke.out" | last_json_string)"
echo "primary_after_revoke_project_id=$primary_after_revoke_project_id"

echo "== sign out primary session"
signed_out="$(request_json "$primary_cookie" /api/auth/sign-out '{}')"
echo "$signed_out"

echo "== signed-out primary token no longer authorizes product writes"
primary_after_signout_args="{\"organizationId\":\"$organization_id\",\"name\":\"Primary After Signout Should Fail\",\"sessionTokenForExperiment\":\"$primary_token\"}"
convex_run_failure primary-create-after-signout "Unauthenticated" productAuthExperiments:createProject "$primary_after_signout_args"

echo "== current cookie session is null after sign-out"
session_after_signout="$(get_json "$primary_cookie" /api/auth/get-session)"
echo "$session_after_signout"
if [[ "$session_after_signout" != "null" ]]; then
  printf 'expected null get-session after sign-out, got %s\n' "$session_after_signout" >&2
  exit 1
fi

echo "== inspect session lifecycle tables"
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents
capture_data "$verify_dir/app-users.json" users

echo "== verify session lifecycle source-of-truth state"
node - "$verify_dir" "$owner_id" "$organization_id" "$primary_before_project_id" "$secondary_before_project_id" "$primary_after_revoke_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  ownerId,
  organizationId,
  primaryBeforeProjectId,
  secondaryBeforeProjectId,
  primaryAfterRevokeProjectId,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const sessionsBefore = JSON.parse(fs.readFileSync(path.join(verifyDir, 'sessions-before.json'), 'utf8'))
const sessions = parseTable('better-auth-sessions.json')
const users = parseTable('better-auth-users.json')
const organizations = parseTable('better-auth-organizations.json')
const members = parseTable('better-auth-members.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

if (!Array.isArray(sessionsBefore) || sessionsBefore.length !== 2) {
  throw new Error(`expected two active sessions before revocation, got ${sessionsBefore.length}`)
}
if (sessions.length !== 0) throw new Error(`expected all sessions deleted after revoke + sign-out, got ${sessions.length}`)

has(users, (row) => row._id === ownerId, 'Better Auth user')
has(organizations, (row) => row._id === organizationId && row.plan === 'team', 'Better Auth organization')
has(members, (row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner', 'owner membership')
has(projects, (row) => row._id === primaryBeforeProjectId && row.createdByAuthUserId === ownerId, 'primary pre-revoke project')
has(projects, (row) => row._id === secondaryBeforeProjectId && row.createdByAuthUserId === ownerId, 'secondary pre-revoke project')
has(projects, (row) => row._id === primaryAfterRevokeProjectId && row.createdByAuthUserId === ownerId, 'primary post-revoke project')

if (projects.length !== 3) throw new Error(`expected exactly 3 product rows, got ${projects.length}`)
if (auditEvents.length !== 3) throw new Error(`expected exactly 3 audit rows, got ${auditEvents.length}`)
has(appUsers, (row) => row.authUserId === ownerId, 'app user projection')
NODE

echo "better-auth session lifecycle feedback loop passed"
