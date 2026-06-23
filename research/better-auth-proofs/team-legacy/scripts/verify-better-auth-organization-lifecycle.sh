#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="lifecycle-owner-$stamp@example.com"
member_email="lifecycle-member-$stamp@example.com"
org_slug="lifecycle-org-$stamp"
updated_org_slug="lifecycle-org-renamed-$stamp"

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

echo "== sign up owner and member"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Lifecycle Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(request_json "$member_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Lifecycle Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
owner_token="$(printf '%s' "$owner_signup" | json_field ".token")"
member_token="$(printf '%s' "$member_signup" | json_field ".token")"

echo "== create organization and two teams through Better Auth"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Lifecycle Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

engineering_team="$(request_json "$owner_cookie" /api/auth/organization/create-team \
  "{\"name\":\"Engineering\",\"organizationId\":\"$organization_id\",\"color\":\"#0f8b6f\"}")"
archive_team="$(request_json "$owner_cookie" /api/auth/organization/create-team \
  "{\"name\":\"Archive\",\"organizationId\":\"$organization_id\",\"color\":\"#667085\"}")"
echo "$engineering_team"
echo "$archive_team"
engineering_team_id="$(printf '%s' "$engineering_team" | json_field ".id")"
archive_team_id="$(printf '%s' "$archive_team" | json_field ".id")"

echo "== update organization and team additional fields"
request_json "$owner_cookie" /api/auth/organization/update \
  "{\"organizationId\":\"$organization_id\",\"data\":{\"name\":\"Lifecycle Org Renamed\",\"slug\":\"$updated_org_slug\",\"plan\":\"enterprise\",\"region\":\"us\"}}"
updated_team="$(request_json "$owner_cookie" /api/auth/organization/update-team \
  "{\"teamId\":\"$engineering_team_id\",\"data\":{\"organizationId\":\"$organization_id\",\"name\":\"Core Platform\",\"color\":\"#7c3aed\"}}")"
echo "$updated_team"

echo "== invite member to team and accept"
invitation="$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$member_email\",\"role\":\"member\",\"teamId\":\"$engineering_team_id\",\"note\":\"Lifecycle onboarding\"}")"
echo "$invitation"
invitation_id="$(printf '%s' "$invitation" | json_field ".id")"
accepted="$(request_json "$member_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}")"
echo "$accepted"
member_record_id="$(printf '%s' "$accepted" | json_field ".member.id")"
echo "member_record_id=$member_record_id"

echo "== member can create before role downgrade"
member_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Before Downgrade\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_success member-create-before-downgrade productAuthExperiments:createProject "$member_create_args"
before_project_id="$(cat "$verify_dir/member-create-before-downgrade.out" | last_json_string)"
echo "before_project_id=$before_project_id"

echo "== owner downgrades member to viewer"
downgraded_member="$(request_json "$owner_cookie" /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$member_record_id\",\"role\":\"viewer\"}")"
echo "$downgraded_member"

echo "== stale member session can still read but cannot create after downgrade"
member_list_args="{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_success member-list-after-downgrade productAuthExperiments:listProjects "$member_list_args"
member_create_after_downgrade_args="{\"organizationId\":\"$organization_id\",\"name\":\"After Downgrade Should Fail\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_failure member-create-after-downgrade "Missing project:create permission" productAuthExperiments:createProject "$member_create_after_downgrade_args"

echo "== owner removes downgraded member"
removed_member="$(request_json "$owner_cookie" /api/auth/organization/remove-member \
  "{\"organizationId\":\"$organization_id\",\"memberIdOrEmail\":\"$member_record_id\"}")"
echo "$removed_member"

echo "== removed member stale session loses read and write access"
convex_run_failure member-list-after-removal "User is not a member of the organization" productAuthExperiments:listProjects "$member_list_args"
member_create_after_removal_args="{\"organizationId\":\"$organization_id\",\"name\":\"After Removal Should Fail\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_failure member-create-after-removal "User is not a member of the organization" productAuthExperiments:createProject "$member_create_after_removal_args"

echo "== owner removes unused team"
removed_team="$(request_json "$owner_cookie" /api/auth/organization/remove-team \
  "{\"organizationId\":\"$organization_id\",\"teamId\":\"$archive_team_id\"}")"
echo "$removed_team"

echo "== owner still has product access after lifecycle changes"
owner_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Owner After Lifecycle\",\"sessionTokenForExperiment\":\"$owner_token\"}"
convex_run_success owner-create-after-lifecycle productAuthExperiments:createProject "$owner_create_args"
owner_project_id="$(cat "$verify_dir/owner-create-after-lifecycle.out" | last_json_string)"
echo "owner_project_id=$owner_project_id"

echo "== inspect lifecycle tables"
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-teams.json" team --component betterAuth
capture_data "$verify_dir/better-auth-team-members.json" teamMember --component betterAuth
capture_data "$verify_dir/better-auth-invitations.json" invitation --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents
capture_data "$verify_dir/app-users.json" users

echo "== verify lifecycle source-of-truth state"
node - "$verify_dir" "$organization_id" "$updated_org_slug" "$owner_id" "$member_id" "$member_record_id" "$engineering_team_id" "$archive_team_id" "$invitation_id" "$before_project_id" "$owner_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  organizationId,
  updatedOrgSlug,
  ownerId,
  memberId,
  memberRecordId,
  engineeringTeamId,
  archiveTeamId,
  invitationId,
  beforeProjectId,
  ownerProjectId,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

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

has(
  organizations,
  (row) =>
    row._id === organizationId &&
    row.name === 'Lifecycle Org Renamed' &&
    row.slug === updatedOrgSlug &&
    row.plan === 'enterprise' &&
    row.region === 'us',
  'updated organization with additional fields'
)
has(members, (row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner', 'remaining owner member')
if (members.some((row) => row._id === memberRecordId || row.userId === memberId)) {
  throw new Error('removed member should not remain in Better Auth member table')
}

has(
  teams,
  (row) =>
    row._id === engineeringTeamId &&
    row.organizationId === organizationId &&
    row.name === 'Core Platform' &&
    row.color === '#7c3aed',
  'updated engineering team'
)
if (teams.some((row) => row._id === archiveTeamId)) {
  throw new Error('removed archive team should not remain in Better Auth team table')
}
if (teamMembers.some((row) => row.userId === memberId)) {
  throw new Error('removed member should not remain in Better Auth teamMember table')
}
has(invitations, (row) => row._id === invitationId && row.status === 'accepted' && row.note === 'Lifecycle onboarding', 'accepted lifecycle invitation')
has(sessions, (row) => row.userId === memberId && row.activeOrganizationId === organizationId, 'stale member session kept for runtime permission proof')
has(projects, (row) => row._id === beforeProjectId && row.createdByAuthUserId === memberId, 'member project before downgrade')
has(projects, (row) => row._id === ownerProjectId && row.createdByAuthUserId === ownerId, 'owner project after lifecycle')
has(auditEvents, (row) => row.resourceId === beforeProjectId && row.action === 'projects.create', 'member pre-downgrade audit event')
has(auditEvents, (row) => row.resourceId === ownerProjectId && row.action === 'projects.create', 'owner post-lifecycle audit event')
has(appUsers, (row) => row.authUserId === ownerId, 'owner app user projection')
has(appUsers, (row) => row.authUserId === memberId, 'member app user projection')

if (projects.length !== 2) throw new Error(`expected exactly 2 product projects, got ${projects.length}`)
if (auditEvents.length !== 2) throw new Error(`expected exactly 2 product audit events, got ${auditEvents.length}`)
NODE

echo "better-auth organization lifecycle feedback loop passed"
