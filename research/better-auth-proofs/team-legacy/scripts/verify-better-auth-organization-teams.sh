#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="teams-owner-$stamp@example.com"
team_member_email="teams-member-$stamp@example.com"
org_member_email="teams-org-member-$stamp@example.com"
outsider_email="teams-outsider-$stamp@example.com"
org_slug="teams-org-$stamp"

owner_cookie="$(mktemp)"
team_member_cookie="$(mktemp)"
org_member_cookie="$(mktemp)"
outsider_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$team_member_cookie" "$org_member_cookie" "$outsider_cookie"; rm -rf "$verify_dir"' EXIT

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

echo "== sign up owner, team member, org member, and outsider"
owner_signup="$(expect_json "owner sign-up" "$owner_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Teams Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
team_member_signup="$(expect_json "team member sign-up" "$team_member_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Teams Member\",\"email\":\"$team_member_email\",\"password\":\"$password\"}")"
org_member_signup="$(expect_json "org member sign-up" "$org_member_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Teams Org Member\",\"email\":\"$org_member_email\",\"password\":\"$password\"}")"
outsider_signup="$(expect_json "outsider sign-up" "$outsider_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Teams Outsider\",\"email\":\"$outsider_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$team_member_signup"
echo "$org_member_signup"
echo "$outsider_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
team_member_id="$(printf '%s' "$team_member_signup" | json_field ".user.id")"
org_member_id="$(printf '%s' "$org_member_signup" | json_field ".user.id")"
outsider_id="$(printf '%s' "$outsider_signup" | json_field ".user.id")"
team_member_token="$(printf '%s' "$team_member_signup" | json_field ".token")"
org_member_token="$(printf '%s' "$org_member_signup" | json_field ".token")"
outsider_token="$(printf '%s' "$outsider_signup" | json_field ".token")"

echo "== owner creates organization and teams through Better Auth"
organization="$(expect_json "create org" "$owner_cookie" POST /api/auth/organization/create \
  "{\"name\":\"Teams Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

alpha_team="$(expect_json "create alpha team" "$owner_cookie" POST /api/auth/organization/create-team \
  "{\"name\":\"Alpha\",\"organizationId\":\"$organization_id\",\"color\":\"#2563eb\"}")"
beta_team="$(expect_json "create beta team" "$owner_cookie" POST /api/auth/organization/create-team \
  "{\"name\":\"Beta\",\"organizationId\":\"$organization_id\",\"color\":\"#16a34a\"}")"
echo "$alpha_team"
echo "$beta_team"
alpha_team_id="$(printf '%s' "$alpha_team" | json_field ".id")"
beta_team_id="$(printf '%s' "$beta_team" | json_field ".id")"

echo "== owner invites one member into alpha team and one member only into the organization"
team_invitation="$(expect_json "invite team member" "$owner_cookie" POST /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$team_member_email\",\"role\":\"member\",\"teamId\":\"$alpha_team_id\",\"note\":\"Alpha onboarding\"}")"
org_invitation="$(expect_json "invite org member" "$owner_cookie" POST /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$org_member_email\",\"role\":\"member\",\"note\":\"Org-only onboarding\"}")"
echo "$team_invitation"
echo "$org_invitation"
team_invitation_id="$(printf '%s' "$team_invitation" | json_field ".id")"
org_invitation_id="$(printf '%s' "$org_invitation" | json_field ".id")"

team_accepted="$(expect_json "team member accepts" "$team_member_cookie" POST /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$team_invitation_id\"}")"
org_accepted="$(expect_json "org member accepts" "$org_member_cookie" POST /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$org_invitation_id\"}")"
echo "$team_accepted"
echo "$org_accepted"

echo "== team member can set active team and list team members"
expect_json "team member set active org" "$team_member_cookie" POST /api/auth/organization/set-active \
  "{\"organizationId\":\"$organization_id\"}" >/dev/null
expect_json "team member set active team" "$team_member_cookie" POST /api/auth/organization/set-active-team \
  "{\"teamId\":\"$alpha_team_id\"}" >/dev/null
alpha_members="$(expect_json "team member list alpha members" "$team_member_cookie" GET \
  "/api/auth/organization/list-team-members?teamId=$alpha_team_id")"
echo "$alpha_members"

echo "== team-scoped product writes use Better Auth team membership"
team_create_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$alpha_team_id\",\"name\":\"Alpha Project\",\"sessionTokenForExperiment\":\"$team_member_token\"}"
convex_run_success team-member-create-alpha productAuthExperiments:createTeamProject "$team_create_args"
alpha_project_id="$(cat "$verify_dir/team-member-create-alpha.out" | last_json_string)"
echo "alpha_project_id=$alpha_project_id"

team_list_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$alpha_team_id\",\"sessionTokenForExperiment\":\"$team_member_token\"}"
convex_run_success team-member-list-alpha productAuthExperiments:listTeamProjects "$team_list_args"

org_member_create_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$alpha_team_id\",\"name\":\"Org Member Should Fail\",\"sessionTokenForExperiment\":\"$org_member_token\"}"
convex_run_failure org-member-create-alpha "User is not a member of the team" productAuthExperiments:createTeamProject "$org_member_create_args"

cross_team_list_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$beta_team_id\",\"sessionTokenForExperiment\":\"$team_member_token\"}"
convex_run_failure team-member-list-beta "User is not a member of the team" productAuthExperiments:listTeamProjects "$cross_team_list_args"

outsider_create_args="{\"organizationId\":\"$organization_id\",\"teamId\":\"$alpha_team_id\",\"name\":\"Outsider Should Fail\",\"sessionTokenForExperiment\":\"$outsider_token\"}"
convex_run_failure outsider-create-alpha "User is not a member of the organization" productAuthExperiments:createTeamProject "$outsider_create_args"

echo "== inspect team source-of-truth tables"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-teams.json" team --component betterAuth
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth
capture_data "$verify_dir/better-auth-invitations.json" invitation --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents
capture_data "$verify_dir/app-users.json" users

echo "== verify team source-of-truth state"
node - "$verify_dir" "$organization_id" "$owner_id" "$team_member_id" "$org_member_id" "$outsider_id" "$alpha_team_id" "$beta_team_id" "$alpha_project_id" "$team_invitation_id" "$org_invitation_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  organizationId,
  ownerId,
  teamMemberId,
  orgMemberId,
  outsiderId,
  alphaTeamId,
  betaTeamId,
  alphaProjectId,
  teamInvitationId,
  orgInvitationId,
] = process.argv.slice(2)

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
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(users, (row) => row._id === ownerId, 'owner component user')
has(users, (row) => row._id === teamMemberId, 'team member component user')
has(users, (row) => row._id === orgMemberId, 'org member component user')
has(users, (row) => row._id === outsiderId, 'outsider component user')
has(organizations, (row) => row._id === organizationId && row.plan === 'team', 'Better Auth organization')
has(members, (row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner', 'owner org membership')
has(members, (row) => row.organizationId === organizationId && row.userId === teamMemberId && row.role === 'member', 'team member org membership')
has(members, (row) => row.organizationId === organizationId && row.userId === orgMemberId && row.role === 'member', 'org-only member org membership')
if (members.some((row) => row.userId === outsiderId)) {
  throw new Error('outsider should not have Better Auth organization membership')
}

has(teams, (row) => row._id === alphaTeamId && row.organizationId === organizationId && row.name === 'Alpha' && row.color === '#2563eb', 'alpha team')
has(teams, (row) => row._id === betaTeamId && row.organizationId === organizationId && row.name === 'Beta' && row.color === '#16a34a', 'beta team')
has(teamMembers, (row) => row.teamId === alphaTeamId && row.userId === teamMemberId, 'alpha team membership')
if (teamMembers.some((row) => row.teamId === betaTeamId && row.userId === teamMemberId)) {
  throw new Error('team member should not be in beta team')
}
if (teamMembers.some((row) => row.userId === orgMemberId)) {
  throw new Error('org-only member should not have a Better Auth teamMember row')
}

has(invitations, (row) => row._id === teamInvitationId && row.status === 'accepted' && row.teamId === alphaTeamId && row.note === 'Alpha onboarding', 'accepted team invitation')
has(invitations, (row) => row._id === orgInvitationId && row.status === 'accepted' && !row.teamId && row.note === 'Org-only onboarding', 'accepted org-only invitation')
has(sessions, (row) => row.userId === teamMemberId && row.activeOrganizationId === organizationId && row.activeTeamId === alphaTeamId, 'team member active session state')
has(projects, (row) => row._id === alphaProjectId && row.organizationId === organizationId && row.teamId === alphaTeamId && row.createdByAuthUserId === teamMemberId, 'team-scoped product row')
has(auditEvents, (row) => row.resourceId === alphaProjectId && row.actorAuthUserId === teamMemberId && row.action === 'projects.create', 'team-scoped audit event')
has(appUsers, (row) => row.authUserId === ownerId, 'owner app user projection')
has(appUsers, (row) => row.authUserId === teamMemberId, 'team member app user projection')
has(appUsers, (row) => row.authUserId === orgMemberId, 'org member app user projection')
has(appUsers, (row) => row.authUserId === outsiderId, 'outsider app user projection')

if (projects.length !== 1) throw new Error(`expected exactly 1 project, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected exactly 1 audit event, got ${auditEvents.length}`)
NODE

echo "better-auth organization teams feedback loop passed"
