#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="product-owner-$stamp@example.com"
member_email="product-member-$stamp@example.com"
viewer_email="product-viewer-$stamp@example.com"
outsider_email="product-outsider-$stamp@example.com"
org_slug="product-org-$stamp"

owner_cookie="$(mktemp)"
member_cookie="$(mktemp)"
viewer_cookie="$(mktemp)"
outsider_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$member_cookie" "$viewer_cookie" "$outsider_cookie"; rm -rf "$verify_dir"' EXIT

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

echo "== sign up users"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Product Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(request_json "$member_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Product Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
viewer_signup="$(request_json "$viewer_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Product Viewer\",\"email\":\"$viewer_email\",\"password\":\"$password\"}")"
outsider_signup="$(request_json "$outsider_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Product Outsider\",\"email\":\"$outsider_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
echo "$viewer_signup"
echo "$outsider_signup"
owner_token="$(printf '%s' "$owner_signup" | json_field ".token")"
member_token="$(printf '%s' "$member_signup" | json_field ".token")"
viewer_token="$(printf '%s' "$viewer_signup" | json_field ".token")"
outsider_token="$(printf '%s' "$outsider_signup" | json_field ".token")"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
viewer_id="$(printf '%s' "$viewer_signup" | json_field ".user.id")"
outsider_id="$(printf '%s' "$outsider_signup" | json_field ".user.id")"

echo "== create org and invite member/viewer"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"Product Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"
member_invitation="$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$member_email\",\"role\":\"member\"}")"
viewer_invitation="$(request_json "$owner_cookie" /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$viewer_email\",\"role\":\"viewer\"}")"
echo "$member_invitation"
echo "$viewer_invitation"
member_invitation_id="$(printf '%s' "$member_invitation" | json_field ".id")"
viewer_invitation_id="$(printf '%s' "$viewer_invitation" | json_field ".id")"
request_json "$member_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$member_invitation_id\"}" >/dev/null
request_json "$viewer_cookie" /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$viewer_invitation_id\"}" >/dev/null

echo "== owner creates product row through Convex + Better Auth permission"
owner_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Owner Project\",\"sessionTokenForExperiment\":\"$owner_token\"}"
convex_run_success owner-create productAuthExperiments:createProject "$owner_create_args"
owner_project_id="$(cat "$verify_dir/owner-create.out" | last_json_string)"
echo "owner_project_id=$owner_project_id"

echo "== member creates product row through Convex + Better Auth permission"
member_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Member Project\",\"sessionTokenForExperiment\":\"$member_token\"}"
convex_run_success member-create productAuthExperiments:createProject "$member_create_args"
member_project_id="$(cat "$verify_dir/member-create.out" | last_json_string)"
echo "member_project_id=$member_project_id"

echo "== viewer can read but cannot create"
viewer_list_args="{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$viewer_token\"}"
convex_run_success viewer-list productAuthExperiments:listProjects "$viewer_list_args"
viewer_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Viewer Should Fail\",\"sessionTokenForExperiment\":\"$viewer_token\"}"
convex_run_failure viewer-create "Missing project:create permission" productAuthExperiments:createProject "$viewer_create_args"

echo "== outsider cannot read or create"
outsider_list_args="{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$outsider_token\"}"
convex_run_failure outsider-list "User is not a member of the organization" productAuthExperiments:listProjects "$outsider_list_args"
outsider_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Outsider Should Fail\",\"sessionTokenForExperiment\":\"$outsider_token\"}"
convex_run_failure outsider-create "User is not a member of the organization" productAuthExperiments:createProject "$outsider_create_args"

echo "== inspect product/auth tables"
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify product authorization state"
node - "$verify_dir" "$organization_id" "$owner_id" "$member_id" "$viewer_id" "$outsider_id" "$owner_project_id" "$member_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, memberId, viewerId, outsiderId, ownerProjectId, memberProjectId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')
const members = parseTable('better-auth-members.json')
const appUsers = parseTable('app-users.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(projects, (row) => row._id === ownerProjectId && row.createdByAuthUserId === ownerId && row.organizationId === organizationId, 'owner-created project')
has(projects, (row) => row._id === memberProjectId && row.createdByAuthUserId === memberId && row.organizationId === organizationId, 'member-created project')
has(auditEvents, (row) => row.resourceId === ownerProjectId && row.actorAuthUserId === ownerId, 'owner audit event')
has(auditEvents, (row) => row.resourceId === memberProjectId && row.actorAuthUserId === memberId, 'member audit event')
has(members, (row) => row.userId === ownerId && row.role === 'owner', 'owner member')
has(members, (row) => row.userId === memberId && row.role === 'member', 'member role')
has(members, (row) => row.userId === viewerId && row.role === 'viewer', 'viewer role')
has(appUsers, (row) => row.authUserId === outsiderId, 'outsider projection')

if (projects.length !== 2) throw new Error(`expected 2 product projects, got ${projects.length}`)
if (auditEvents.length !== 2) throw new Error(`expected 2 product audit events, got ${auditEvents.length}`)
NODE

echo "better-auth product authorization feedback loop passed"
