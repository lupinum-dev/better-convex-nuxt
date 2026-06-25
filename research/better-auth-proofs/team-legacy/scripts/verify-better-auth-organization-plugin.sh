#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
owner_email="plugin-owner-$stamp@example.com"
invitee_email="plugin-invitee-$stamp@example.com"
password="password123"
org_slug="plugin-org-$stamp"

owner_cookie="$(mktemp)"
invitee_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$invitee_cookie"; rm -rf "$verify_dir"' EXIT

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

convex_data() {
  pnpm exec convex data "$@" --format json --limit 50
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

echo "== owner sign-up"
owner_signup=$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Plugin Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")
echo "$owner_signup"
owner_id=$(printf '%s' "$owner_signup" | json_field ".user.id")
echo "owner_id=$owner_id"

echo "== create organization through Better Auth plugin"
organization=$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Plugin Org\",\"slug\":\"$org_slug\",\"plan\":\"trial\",\"region\":\"eu\"}")
echo "$organization"
organization_id=$(printf '%s' "$organization" | json_field ".id")
echo "organization_id=$organization_id"

echo "== create team through Better Auth plugin"
team=$(request_json "$owner_cookie" /api/auth/organization/create-team \
  "{\"name\":\"Platform\",\"organizationId\":\"$organization_id\",\"color\":\"#1463ff\"}")
echo "$team"
team_id=$(printf '%s' "$team" | json_field ".id")
echo "team_id=$team_id"

echo "== update organization through Better Auth plugin"
updated_organization=$(request_json "$owner_cookie" /api/auth/organization/update \
  "{\"organizationId\":\"$organization_id\",\"data\":{\"name\":\"Plugin Org Renamed\",\"plan\":\"enterprise\"}}")
echo "$updated_organization"

echo "== invite member through Better Auth plugin"
invitation=$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$invitee_email\",\"role\":\"member\",\"teamId\":\"$team_id\",\"note\":\"Platform onboarding\"}")
echo "$invitation"
invitation_id=$(printf '%s' "$invitation" | json_field ".id")
echo "invitation_id=$invitation_id"

echo "== invitee sign-up"
invitee_signup=$(request_json "$invitee_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Plugin Invitee\",\"email\":\"$invitee_email\",\"password\":\"$password\"}")
echo "$invitee_signup"
invitee_id=$(printf '%s' "$invitee_signup" | json_field ".user.id")
echo "invitee_id=$invitee_id"

echo "== invitee accept invitation through Better Auth plugin"
accepted=$(request_json "$invitee_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}")
echo "$accepted"

echo "== betterAuth users"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth

echo "== betterAuth organizations"
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth

echo "== betterAuth members"
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth

echo "== betterAuth teams"
capture_data "$verify_dir/better-auth-teams.json" team --component betterAuth

echo "== betterAuth team members"
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth

echo "== betterAuth invitations"
capture_data "$verify_dir/better-auth-invitations.json" invitation --component betterAuth

echo "== app user projection"
capture_data "$verify_dir/app-users.json" users



echo "== verify expected plugin-owned rows"
node - "$verify_dir" "$organization_id" "$team_id" "$owner_id" "$invitee_id" "$invitation_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, teamId, ownerId, inviteeId, invitationId] = process.argv.slice(2)
if (!organizationId || !teamId || !ownerId || !inviteeId || !invitationId) {
  throw new Error('missing ids from plugin flow')
}

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
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(users, (row) => row._id === ownerId, 'owner component user')
has(users, (row) => row._id === inviteeId, 'invitee component user')
has(organizations, (row) => row._id === organizationId && row.name === 'Plugin Org Renamed' && row.plan === 'enterprise' && row.region === 'eu', 'renamed plugin organization with additional fields')
has(members, (row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner', 'owner member')
has(members, (row) => row.organizationId === organizationId && row.userId === inviteeId && row.role === 'member', 'invitee member')
has(teams, (row) => row._id === teamId && row.organizationId === organizationId && row.color === '#1463ff', 'created team with additional fields')
has(teamMembers, (row) => row.teamId === teamId && row.userId === inviteeId, 'invitee team membership')
has(invitations, (row) => row._id === invitationId && row.status === 'accepted' && row.note === 'Platform onboarding', 'accepted invitation with additional fields')
has(appUsers, (row) => row.authUserId === ownerId, 'owner app user projection')
has(appUsers, (row) => row.authUserId === inviteeId, 'invitee app user projection')

NODE

echo "plugin organization feedback loop passed"
