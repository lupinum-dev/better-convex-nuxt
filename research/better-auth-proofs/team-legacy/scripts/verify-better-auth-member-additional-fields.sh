#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="member-fields-owner-$stamp@example.com"
member_email="member-fields-member-$stamp@example.com"
org_slug="member-fields-org-$stamp"

owner_cookie="$(mktemp)"
member_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$member_cookie"; rm -rf "$verify_dir"' EXIT

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

request_failure() {
  local cookie_jar="$1"
  local path="$2"
  local expected_status="$3"
  local body="$4"
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
  echo "$payload"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'expected %s %s to fail with %s, got %s\n%s\n' "$path" "$body" "$expected_status" "$status" "$payload" >&2
    exit 1
  fi
}

convex_run_json() {
  local fn="$1"
  local args="$2"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output" >&2
  printf '%s' "$output" | node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const start = input.indexOf('{'); const end = input.lastIndexOf('}'); if (start < 0 || end < start) throw new Error('convex run did not return a JSON object'); process.stdout.write(JSON.stringify(JSON.parse(input.slice(start, end + 1)))); })"
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

echo "== sign up owner and future member"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Member Fields Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(request_json "$member_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Member Fields Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_user_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
owner_token="$(printf '%s' "$owner_signup" | json_field ".token")"

echo "== create organization and team"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Member Fields Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
team="$(request_json "$owner_cookie" /api/auth/organization/create-team \
  "{\"name\":\"Delivery\",\"organizationId\":\"$(printf '%s' "$organization" | json_field ".id")\",\"color\":\"#2257d6\"}")"
echo "$organization"
echo "$team"
organization_id="$(printf '%s' "$organization" | json_field ".id")"
team_id="$(printf '%s' "$team" | json_field ".id")"

echo "== prove public HTTP add-member is unavailable in this setup"
request_failure "$owner_cookie" /api/auth/organization/add-member 404 \
  "{\"organizationId\":\"$organization_id\",\"userId\":\"$member_user_id\",\"role\":\"member\",\"teamId\":\"$team_id\",\"title\":\"Solutions Engineer\",\"department\":\"Customer Success\",\"billable\":true}"

echo "== add existing user with Better Auth server-side member additional fields"
added_member="$(convex_run_json memberProfileExperiments:addMemberWithProfile \
  "{\"organizationId\":\"$organization_id\",\"userId\":\"$member_user_id\",\"teamId\":\"$team_id\",\"sessionTokenForExperiment\":\"$owner_token\"}")"
echo "$added_member"
member_record_id="$(printf '%s' "$added_member" | json_field ".id")"

echo "== update role while attempting to change member profile fields"
updated_member="$(request_json "$owner_cookie" /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$member_record_id\",\"role\":\"admin\",\"title\":\"Changed Title\",\"department\":\"Changed Department\",\"billable\":false}")"
echo "$updated_member"

echo "== inspect Better Auth and app tables"
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify member additional-field source-of-truth state"
node - "$verify_dir" "$owner_id" "$member_user_id" "$member_record_id" "$organization_id" "$team_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, ownerId, memberUserId, memberRecordId, organizationId, teamId] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '') return []
  if (raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const members = parseTable('better-auth-members.json')
const teamMembers = parseTable('better-auth-team-members.json')
const appUsers = parseTable('app-users.json')

const ownerMember = members.find(
  (row) => row.organizationId === organizationId && row.userId === ownerId
)
if (!ownerMember || ownerMember.role !== 'owner') throw new Error('missing owner member row')

const member = members.find((row) => row._id === memberRecordId)
if (!member) throw new Error('missing added Better Auth member row')
if (member.organizationId !== organizationId) throw new Error('member organization mismatch')
if (member.userId !== memberUserId) throw new Error('member user mismatch')
if (member.role !== 'admin') throw new Error('member role update did not apply')
if (member.title !== 'Solutions Engineer') throw new Error('member title was not preserved')
if (member.department !== 'Customer Success') throw new Error('member department was not preserved')
if (member.billable !== true) throw new Error('member billable flag was not preserved')

if (!teamMembers.some((row) => row.teamId === teamId && row.userId === memberUserId)) {
  throw new Error('member was not added to the team')
}

if (!appUsers.some((row) => row.authUserId === ownerId)) {
  throw new Error('missing owner app user projection')
}
if (!appUsers.some((row) => row.authUserId === memberUserId)) {
  throw new Error('missing member app user projection')
}
NODE

echo "better-auth member additional-fields feedback loop passed"
