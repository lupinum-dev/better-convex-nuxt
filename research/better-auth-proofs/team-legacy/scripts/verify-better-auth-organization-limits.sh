#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="limits-owner-$stamp@example.com"
member_email="limits-member-$stamp@example.com"
outsider_email="limits-outsider-$stamp@example.com"
org_slug="limits-org-$stamp"

owner_cookie="$(mktemp)"
member_cookie="$(mktemp)"
outsider_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$member_cookie" "$outsider_cookie"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
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
  printf '%s\n%s' "$status" "$payload"
}

expect_status() {
  local label="$1"
  local expected_status="$2"
  local cookie_jar="$3"
  local method="$4"
  local path="$5"
  local body="${6:-}"
  local response
  local status
  local payload

  response="$(request "$cookie_jar" "$method" "$path" "$body")"
  status="$(printf '%s' "$response" | head -n 1)"
  payload="$(printf '%s' "$response" | tail -n +2)"
  echo "$payload"
  if [[ "$status" != "$expected_status" ]]; then
    printf '%s expected HTTP %s but got %s\n%s\n' "$label" "$expected_status" "$status" "$payload" >&2
    exit 1
  fi
}

expect_json() {
  expect_status "$1" "200" "$2" "$3" "$4" "${5:-}"
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

echo "== sign up owner/member/outsider"
owner_signup="$(expect_json "owner sign-up" "$owner_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Limits Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(expect_json "member sign-up" "$member_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Limits Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
outsider_signup="$(expect_json "outsider sign-up" "$outsider_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Limits Outsider\",\"email\":\"$outsider_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
echo "$outsider_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
outsider_id="$(printf '%s' "$outsider_signup" | json_field ".user.id")"
echo "owner_id=$owner_id"
echo "member_id=$member_id"
echo "outsider_id=$outsider_id"

echo "== owner creates organization"
organization="$(expect_json "create org" "$owner_cookie" POST /api/auth/organization/create \
  "{\"name\":\"Limits Org\",\"slug\":\"$org_slug\",\"plan\":\"trial\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"
owner_member_id="$(printf '%s' "$organization" | json_field ".members[0].id")"
default_team_id="$(convex_data team --component betterAuth | json_field "[0]._id")"
echo "organization_id=$organization_id"
echo "owner_member_id=$owner_member_id"
echo "default_team_id=$default_team_id"

echo "== duplicate slug fails"
expect_status "duplicate slug" "400" "$owner_cookie" POST /api/auth/organization/create \
  "{\"name\":\"Limits Org Duplicate\",\"slug\":\"$org_slug\"}"

echo "== outsider cannot access organization"
expect_status "outsider list members" "403" "$outsider_cookie" GET \
  "/api/auth/organization/list-members?organizationId=$organization_id"
expect_status "outsider set active org" "403" "$outsider_cookie" POST \
  /api/auth/organization/set-active "{\"organizationId\":\"$organization_id\"}"

echo "== owner invites member and member accepts"
invitation="$(expect_json "invite member" "$owner_cookie" POST /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$member_email\",\"role\":\"member\",\"teamId\":\"$default_team_id\",\"note\":\"Limits onboarding\"}")"
echo "$invitation"
invitation_id="$(printf '%s' "$invitation" | json_field ".id")"
accepted="$(expect_json "accept invitation" "$member_cookie" POST /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}")"
echo "$accepted"
member_member_id="$(printf '%s' "$accepted" | json_field ".member.id")"
echo "member_member_id=$member_member_id"

echo "== active org and team session state works"
expect_json "owner set active org" "$owner_cookie" POST /api/auth/organization/set-active \
  "{\"organizationId\":\"$organization_id\"}" >/dev/null
expect_json "member set active org" "$member_cookie" POST /api/auth/organization/set-active \
  "{\"organizationId\":\"$organization_id\"}" >/dev/null
expect_json "member set active team" "$member_cookie" POST /api/auth/organization/set-active-team \
  "{\"teamId\":\"$default_team_id\"}" >/dev/null
active_member="$(expect_json "member active member" "$member_cookie" GET /api/auth/organization/get-active-member)"
echo "$active_member"

echo "== member role has no org/team/invite mutations"
member_org_permission="$(expect_json "member org permission" "$member_cookie" POST /api/auth/organization/has-permission \
  "{\"organizationId\":\"$organization_id\",\"permissions\":{\"organization\":[\"update\"]}}")"
member_team_permission="$(expect_json "member team permission" "$member_cookie" POST /api/auth/organization/has-permission \
  "{\"organizationId\":\"$organization_id\",\"permissions\":{\"team\":[\"create\"]}}")"
echo "$member_org_permission"
echo "$member_team_permission"
expect_status "member update org denied" "403" "$member_cookie" POST /api/auth/organization/update \
  "{\"organizationId\":\"$organization_id\",\"data\":{\"name\":\"Member Rename Should Fail\"}}"
expect_status "member create team denied" "403" "$member_cookie" POST /api/auth/organization/create-team \
  "{\"name\":\"Member Team Should Fail\",\"organizationId\":\"$organization_id\"}"
expect_status "member invite denied" "403" "$member_cookie" POST /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"nobody-$stamp@example.com\",\"role\":\"member\"}"

echo "== owner upgrades member to admin"
admin_member="$(expect_json "owner updates member role to admin" "$owner_cookie" POST /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$member_member_id\",\"role\":\"admin\"}")"
echo "$admin_member"
admin_org_permission="$(expect_json "admin org permission" "$member_cookie" POST /api/auth/organization/has-permission \
  "{\"organizationId\":\"$organization_id\",\"permissions\":{\"organization\":[\"update\"],\"team\":[\"create\"],\"invitation\":[\"create\"]}}")"
echo "$admin_org_permission"

echo "== admin can mutate org and teams but still cannot remove only owner"
updated_by_admin="$(expect_json "admin update org" "$member_cookie" POST /api/auth/organization/update \
  "{\"organizationId\":\"$organization_id\",\"data\":{\"name\":\"Limits Org Admin Renamed\",\"plan\":\"scaleup\"}}")"
echo "$updated_by_admin"
admin_team="$(expect_json "admin create team" "$member_cookie" POST /api/auth/organization/create-team \
  "{\"name\":\"Admin Team\",\"organizationId\":\"$organization_id\",\"color\":\"#0f8b6f\"}")"
echo "$admin_team"
expect_status "admin cannot remove only owner" "400" "$member_cookie" POST /api/auth/organization/remove-member \
  "{\"organizationId\":\"$organization_id\",\"memberIdOrEmail\":\"$owner_member_id\"}"

echo "== owner transfer allows original owner to leave"
owner_role_member="$(expect_json "owner upgrades member to owner" "$owner_cookie" POST /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$member_member_id\",\"role\":\"owner\"}")"
echo "$owner_role_member"
left_member="$(expect_json "original owner leaves" "$owner_cookie" POST /api/auth/organization/leave \
  "{\"organizationId\":\"$organization_id\"}")"
echo "$left_member"
expect_status "former owner cannot list members" "403" "$owner_cookie" GET \
  "/api/auth/organization/list-members?organizationId=$organization_id"

echo "== inspect component/app tables"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-teams.json" team --component betterAuth
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth
capture_data "$verify_dir/better-auth-invitations.json" invitation --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify expected limits state"
node - "$verify_dir" "$organization_id" "$owner_id" "$member_id" "$outsider_id" "$owner_member_id" "$member_member_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, memberId, outsiderId, ownerMemberId, memberMemberId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const users = parseTable('better-auth-users.json')
const organizations = parseTable('better-auth-organizations.json')
const members = parseTable('better-auth-members.json')
const teams = parseTable('better-auth-teams.json')
const teamMembers = parseTable('better-auth-team-members.json')
const invitations = parseTable('better-auth-invitations.json')
const sessions = parseTable('better-auth-sessions.json')
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(users, (row) => row._id === ownerId, 'owner component user')
has(users, (row) => row._id === memberId, 'member component user')
has(users, (row) => row._id === outsiderId, 'outsider component user')
has(organizations, (row) => row._id === organizationId && row.name === 'Limits Org Admin Renamed' && row.plan === 'scaleup' && row.region === 'eu', 'admin-renamed org with additional fields')
has(members, (row) => row._id === memberMemberId && row.userId === memberId && row.role === 'owner', 'transferred owner membership')
has(teams, (row) => row.name === 'Admin Team' && row.organizationId === organizationId && row.color === '#0f8b6f', 'admin-created team with additional fields')
has(teamMembers, (row) => row.userId === memberId, 'member team membership')
has(invitations, (row) => row.status === 'accepted' && row.organizationId === organizationId && row.note === 'Limits onboarding', 'accepted invitation with additional fields')
has(appUsers, (row) => row.authUserId === ownerId, 'owner app user projection')
has(appUsers, (row) => row.authUserId === memberId, 'member app user projection')
has(appUsers, (row) => row.authUserId === outsiderId, 'outsider app user projection')

if (members.some((row) => row._id === ownerMemberId)) {
  throw new Error('original owner membership should be removed after leave')
}
if (!sessions.some((row) => row.userId === ownerId && !row.activeOrganizationId)) {
  throw new Error('former owner session should clear active organization after leave')
}
NODE

echo "plugin organization limits feedback loop passed"
