#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="org-remove-all-teams-owner-$stamp@example.com"
member_email="org-remove-all-teams-member-$stamp@example.com"
org_slug="org-remove-all-teams-$stamp"

owner_cookie="$(mktemp)"
member_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_ALLOW_REMOVE_ALL_TEAMS_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$owner_cookie" "$member_cookie"
  rm -rf "$verify_dir"
}

trap cleanup EXIT

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

echo "== enable allowRemovingAllTeams experiment and hard reset"
pnpm exec convex env set BETTER_AUTH_ALLOW_REMOVE_ALL_TEAMS_EXPERIMENT true --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== sign up owner and member"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Remove All Teams Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(request_json "$member_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Remove All Teams Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
member_token="$(printf '%s' "$member_signup" | json_field ".token")"

echo "== create organization and explicit team"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Remove All Teams\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"
default_team_id="$(convex_data team --component betterAuth | json_field "[0]._id")"
explicit_team="$(request_json "$owner_cookie" /api/auth/organization/create-team \
  "{\"name\":\"Last Team Candidate\",\"organizationId\":\"$organization_id\",\"color\":\"#0f8b6f\"}")"
echo "$explicit_team"
explicit_team_id="$(printf '%s' "$explicit_team" | json_field ".id")"

echo "== invite member into explicit team"
invitation="$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$member_email\",\"role\":\"member\",\"teamId\":\"$explicit_team_id\"}")"
echo "$invitation"
invitation_id="$(printf '%s' "$invitation" | json_field ".id")"
accepted="$(request_json "$member_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}")"
echo "$accepted"

echo "== member creates team product row before cleanup"
member_team_create_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$explicit_team_id\",\"name\":\"Before Remove All Teams\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_success member-team-create-before-cleanup productAuthExperiments:createTeamProject "$member_team_create_args"
member_team_project_id="$(cat "$verify_dir/member-team-create-before-cleanup.out" | last_json_string)"

echo "== Better Auth routes remove every team when allowRemovingAllTeams is enabled"
request_json "$owner_cookie" /api/auth/organization/set-active-team '{"teamId":null}'
removed_default="$(request_json "$owner_cookie" /api/auth/organization/remove-team \
  "{\"organizationId\":\"$organization_id\",\"teamId\":\"$default_team_id\"}")"
removed_explicit="$(request_json "$owner_cookie" /api/auth/organization/remove-team \
  "{\"organizationId\":\"$organization_id\",\"teamId\":\"$explicit_team_id\"}")"
echo "$removed_default"
echo "$removed_explicit"

echo "== delete organization after all teams are removed"
deleted_org="$(request_json "$owner_cookie" /api/auth/organization/delete \
  "{\"organizationId\":\"$organization_id\"}")"
echo "$deleted_org"
printf '%s' "$deleted_org" > "$verify_dir/deleted-org.json"

echo "== stale member session loses product access after deletion"
member_team_list_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$explicit_team_id\",\"sessionTokenForExperiment\":\"$member_token\"}"
member_team_create_after_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$explicit_team_id\",\"name\":\"After Delete Should Fail\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_failure member-team-list-after-delete "User is not a member of the organization" productAuthExperiments:listTeamProjects "$member_team_list_args"
convex_run_failure member-team-create-after-delete "User is not a member of the organization" productAuthExperiments:createTeamProject "$member_team_create_after_args"

echo "== inspect allow-remove-all-teams deletion tables"
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-teams.json" team --component betterAuth
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth
capture_data "$verify_dir/better-auth-invitations.json" invitation --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify allow-remove-all-teams deletion boundary"
node - "$verify_dir" "$organization_id" "$owner_id" "$member_id" "$default_team_id" "$explicit_team_id" "$member_team_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  organizationId,
  ownerId,
  memberId,
  defaultTeamId,
  explicitTeamId,
  memberTeamProjectId,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const deletedOrg = JSON.parse(fs.readFileSync(path.join(verifyDir, 'deleted-org.json'), 'utf8'))
const organizations = parseTable('better-auth-organizations.json')
const members = parseTable('better-auth-members.json')
const teams = parseTable('better-auth-teams.json')
const teamMembers = parseTable('better-auth-team-members.json')
const invitations = parseTable('better-auth-invitations.json')
const sessions = parseTable('better-auth-sessions.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

if (deletedOrg.id !== organizationId) throw new Error('deleted org response mismatch')
if (organizations.some((row) => row._id === organizationId)) {
  throw new Error('organization should be deleted')
}
if (members.some((row) => row.organizationId === organizationId)) {
  throw new Error('organization member rows should be deleted')
}
if (invitations.some((row) => row.organizationId === organizationId)) {
  throw new Error('organization invitation rows should be deleted')
}
if (teams.some((row) => row._id === defaultTeamId || row._id === explicitTeamId)) {
  throw new Error('allowRemovingAllTeams route cleanup should remove all team rows')
}
if (teamMembers.some((row) => row.teamId === defaultTeamId || row.teamId === explicitTeamId)) {
  throw new Error('allowRemovingAllTeams route cleanup should remove all teamMember rows')
}
if (!sessions.some((row) => row.userId === ownerId && !row.activeOrganizationId && !row.activeTeamId)) {
  throw new Error('owner session should have no active org/team after full team cleanup and org deletion')
}
if (
  !sessions.some(
    (row) =>
      row.userId === memberId &&
      row.activeOrganizationId === organizationId &&
      row.activeTeamId === explicitTeamId
  )
) {
  throw new Error('non-deleting member session should currently keep stale active org/team ids')
}
if (!projects.some((row) => row._id === memberTeamProjectId && row.teamId === explicitTeamId)) {
  throw new Error('team product history should remain')
}
if (projects.length !== 1) throw new Error(`expected one product row, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected one audit row, got ${auditEvents.length}`)
NODE

echo "better-auth organization allow-remove-all-teams feedback loop passed"
