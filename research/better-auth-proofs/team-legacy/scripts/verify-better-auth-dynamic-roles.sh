#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="dynamic-owner-$stamp@example.com"
contractor_email="dynamic-contractor-$stamp@example.com"
org_slug="dynamic-org-$stamp"

owner_cookie="$(mktemp)"
contractor_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$contractor_cookie"; rm -rf "$verify_dir"' EXIT

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

request_json_get() {
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
  if [[ "$payload" != *"$expected"* ]]; then
    printf 'request failed without expected text %s: %s %s\n%s\n' "$expected" "$path" "$status" "$payload" >&2
    exit 1
  fi
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

echo "== sign up users"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Dynamic Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
contractor_signup="$(request_json "$contractor_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Dynamic Contractor\",\"email\":\"$contractor_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$contractor_signup"
owner_token="$(printf '%s' "$owner_signup" | json_field ".token")"
contractor_token="$(printf '%s' "$contractor_signup" | json_field ".token")"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
contractor_id="$(printf '%s' "$contractor_signup" | json_field ".user.id")"

echo "== create organization"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Dynamic Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== invalid dynamic role resource fails"
request_json_failure "$owner_cookie" /api/auth/organization/create-role \
  "{\"organizationId\":\"$organization_id\",\"role\":\"Billing\",\"permission\":{\"billing\":[\"read\"]}}" \
  "INVALID_RESOURCE"

echo "== owner creates dynamic read-only role"
created_role="$(request_json "$owner_cookie" /api/auth/organization/create-role \
  "{\"organizationId\":\"$organization_id\",\"role\":\"Contractor\",\"permission\":{\"project\":[\"read\"]}}")"
echo "$created_role"
role_id="$(printf '%s' "$created_role" | json_field ".roleData.id")"
echo "role_id=$role_id"

echo "== list dynamic roles"
roles="$(request_json_get "$owner_cookie" "/api/auth/organization/list-roles?organizationId=$organization_id")"
echo "$roles"

echo "== invite contractor as normal member and accept"
invitation="$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$contractor_email\",\"role\":\"member\"}")"
echo "$invitation"
invitation_id="$(printf '%s' "$invitation" | json_field ".id")"
accepted="$(request_json "$contractor_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}")"
echo "$accepted"
contractor_member_id="$(printf '%s' "$accepted" | json_field ".member.id")"
echo "contractor_member_id=$contractor_member_id"

echo "== owner assigns dynamic contractor role to member"
updated_member="$(request_json "$owner_cookie" /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$contractor_member_id\",\"role\":\"contractor\"}")"
echo "$updated_member"

echo "== contractor cannot create roles without ac:create"
request_json_failure "$contractor_cookie" /api/auth/organization/create-role \
  "{\"organizationId\":\"$organization_id\",\"role\":\"Shadow Admin\",\"permission\":{\"project\":[\"read\"]}}" \
  "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE"

echo "== owner creates initial project"
owner_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Owner Dynamic Project\",\"sessionTokenForExperiment\":\"$owner_token\"}"
convex_run_success owner-create productAuthExperiments:createProject "$owner_create_args"
owner_project_id="$(cat "$verify_dir/owner-create.out" | last_json_string)"
echo "owner_project_id=$owner_project_id"

echo "== contractor can read but cannot create with read-only dynamic role"
contractor_list_args="{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$contractor_token\"}"
convex_run_success contractor-list-readonly productAuthExperiments:listProjects "$contractor_list_args"
contractor_create_readonly_args="{\"organizationId\":\"$organization_id\",\"name\":\"Contractor Should Fail\",\"sessionTokenForExperiment\":\"$contractor_token\"}"
convex_run_failure contractor-create-readonly "Missing project:create permission" productAuthExperiments:createProject "$contractor_create_readonly_args"

echo "== owner updates dynamic role to allow project creation"
updated_role="$(request_json "$owner_cookie" /api/auth/organization/update-role \
  "{\"organizationId\":\"$organization_id\",\"roleName\":\"contractor\",\"data\":{\"permission\":{\"project\":[\"read\",\"create\"]}}}")"
echo "$updated_role"

echo "== assigned dynamic role cannot be deleted"
request_json_failure "$owner_cookie" /api/auth/organization/delete-role \
  "{\"organizationId\":\"$organization_id\",\"roleName\":\"contractor\"}" \
  "ROLE_IS_ASSIGNED_TO_MEMBERS"

echo "== contractor can now create through updated dynamic role"
contractor_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Contractor Dynamic Project\",\"sessionTokenForExperiment\":\"$contractor_token\"}"
convex_run_success contractor-create productAuthExperiments:createProject "$contractor_create_args"
contractor_project_id="$(cat "$verify_dir/contractor-create.out" | last_json_string)"
echo "contractor_project_id=$contractor_project_id"

echo "== inspect dynamic role and product tables"
capture_data "$verify_dir/organization-roles.json" organizationRole --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify dynamic role state"
node - "$verify_dir" "$organization_id" "$role_id" "$owner_id" "$contractor_id" "$contractor_member_id" "$owner_project_id" "$contractor_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  organizationId,
  roleId,
  ownerId,
  contractorId,
  contractorMemberId,
  ownerProjectId,
  contractorProjectId,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const roles = parseTable('organization-roles.json')
const members = parseTable('members.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(
  roles,
  (row) => {
    if (row._id !== roleId || row.organizationId !== organizationId || row.role !== 'contractor') return false
    const permission = JSON.parse(row.permission)
    return permission.project?.includes('read') && permission.project?.includes('create')
  },
  'updated contractor role'
)
has(members, (row) => row.userId === ownerId && row.role === 'owner', 'owner member')
has(
  members,
  (row) => row._id === contractorMemberId && row.userId === contractorId && row.role === 'contractor',
  'contractor member role'
)
has(projects, (row) => row._id === ownerProjectId && row.createdByAuthUserId === ownerId, 'owner project')
has(
  projects,
  (row) => row._id === contractorProjectId && row.createdByAuthUserId === contractorId,
  'contractor project'
)
has(auditEvents, (row) => row.resourceId === ownerProjectId && row.actorAuthUserId === ownerId, 'owner audit')
has(
  auditEvents,
  (row) => row.resourceId === contractorProjectId && row.actorAuthUserId === contractorId,
  'contractor audit'
)

if (roles.length !== 1) throw new Error(`expected 1 dynamic role, got ${roles.length}`)
if (projects.length !== 2) throw new Error(`expected 2 projects, got ${projects.length}`)
if (auditEvents.length !== 2) throw new Error(`expected 2 audit events, got ${auditEvents.length}`)
NODE

echo "better-auth dynamic role feedback loop passed"
