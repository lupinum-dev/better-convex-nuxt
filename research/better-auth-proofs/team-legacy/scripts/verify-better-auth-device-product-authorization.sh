#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="device-product-owner-$stamp@example.com"
member_email="device-product-member-$stamp@example.com"
org_slug="device-product-org-$stamp"
client_id="team-device-client"

owner_cookie="$(mktemp)"
member_cookie="$(mktemp)"
device_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie" "$member_cookie" "$device_cookie"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

last_json_string() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const line = input.trim().split(/\n/).filter(Boolean).at(-1); process.stdout.write(JSON.parse(line)); })"
}

request_json() {
  local cookie_jar="$1"
  local method="$2"
  local path="$3"
  local body="$4"
  local expected_status="$5"
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
  if [[ "$status" != "$expected_status" ]]; then
    printf 'request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
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

capture_data() {
  local file="$1"
  shift
  pnpm exec convex data "$@" --format json --limit 100 > "$file"
  cat "$file"
  printf '\n'
}

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== sign up owner and member"
owner_signup="$(request_json "$owner_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Device Product Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}" \
  200)"
member_signup="$(request_json "$member_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Device Product Member\",\"email\":\"$member_email\",\"password\":\"$password\"}" \
  200)"
echo "$owner_signup"
echo "$member_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"

echo "== create organization and invite member"
organization="$(request_json "$owner_cookie" POST /api/auth/organization/create \
  "{\"name\":\"Device Product Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}" \
  200)"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

invitation="$(request_json "$owner_cookie" POST /api/auth/organization/invite-member \
  "{\"organizationId\":\"$organization_id\",\"email\":\"$member_email\",\"role\":\"member\"}" \
  200)"
echo "$invitation"
invitation_id="$(printf '%s' "$invitation" | json_field ".id")"

accepted="$(request_json "$member_cookie" POST /api/auth/organization/accept-invitation \
  "{\"invitationId\":\"$invitation_id\"}" \
  200)"
echo "$accepted"
member_record_id="$(printf '%s' "$accepted" | json_field ".member.id")"

echo "== issue device authorization session for member"
device_code_response="$(request_json "$device_cookie" POST /api/auth/device/code \
  "{\"client_id\":\"$client_id\",\"scope\":\"openid profile email\"}" \
  200)"
echo "$device_code_response"
device_code="$(printf '%s' "$device_code_response" | json_field ".device_code")"
user_code="$(printf '%s' "$device_code_response" | json_field ".user_code")"

claim_response="$(request_json "$member_cookie" GET "/api/auth/device?user_code=$user_code" "" 200)"
echo "$claim_response"
approved="$(request_json "$member_cookie" POST /api/auth/device/approve \
  "{\"userCode\":\"$user_code\"}" \
  200)"
echo "$approved"

sleep 1
token_response="$(request_json "$device_cookie" POST /api/auth/device/token \
  "{\"grant_type\":\"urn:ietf:params:oauth:grant-type:device_code\",\"device_code\":\"$device_code\",\"client_id\":\"$client_id\"}" \
  200)"
echo "$token_response"
device_session_token="$(printf '%s' "$token_response" | json_field ".access_token")"
if [[ -z "$device_session_token" || "$device_session_token" == "null" ]]; then
  echo "missing device session token" >&2
  exit 1
fi

echo "== device-issued member session can create product row"
device_create_args="{\"organizationId\":\"$organization_id\",\"name\":\"Device Session Project\",\"sessionTokenForExperiment\":\"$device_session_token\"}"
convex_run_success device-create productAuthExperiments:createProject "$device_create_args"
project_id="$(cat "$verify_dir/device-create.out" | last_json_string)"
echo "project_id=$project_id"

echo "== owner downgrades member to viewer"
downgraded_member="$(request_json "$owner_cookie" POST /api/auth/organization/update-member-role \
  "{\"organizationId\":\"$organization_id\",\"memberId\":\"$member_record_id\",\"role\":\"viewer\"}" \
  200)"
echo "$downgraded_member"

echo "== same device session can still read but cannot create after downgrade"
device_list_args="{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$device_session_token\"}"
convex_run_success device-list-after-downgrade productAuthExperiments:listProjects "$device_list_args"
device_create_after_downgrade_args="{\"organizationId\":\"$organization_id\",\"name\":\"Device After Downgrade Should Fail\",\"sessionTokenForExperiment\":\"$device_session_token\"}"
convex_run_failure device-create-after-downgrade "Missing project:create permission" productAuthExperiments:createProject "$device_create_after_downgrade_args"

echo "== owner removes member"
removed_member="$(request_json "$owner_cookie" POST /api/auth/organization/remove-member \
  "{\"organizationId\":\"$organization_id\",\"memberIdOrEmail\":\"$member_record_id\"}" \
  200)"
echo "$removed_member"

echo "== same device session loses product access after removal"
convex_run_failure device-list-after-removal "User is not a member of the organization" productAuthExperiments:listProjects "$device_list_args"
device_create_after_removal_args="{\"organizationId\":\"$organization_id\",\"name\":\"Device After Removal Should Fail\",\"sessionTokenForExperiment\":\"$device_session_token\"}"
convex_run_failure device-create-after-removal "User is not a member of the organization" productAuthExperiments:createProject "$device_create_after_removal_args"

echo "== inspect device product authorization tables"
capture_data "$verify_dir/device-codes.json" deviceCode --component betterAuth
capture_data "$verify_dir/sessions.json" session --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth
capture_data "$verify_dir/organizations.json" organization --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify device product authorization source-of-truth state"
node - "$verify_dir" "$device_code" "$device_session_token" "$organization_id" "$owner_id" "$member_id" "$member_record_id" "$project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  deviceCode,
  deviceSessionToken,
  organizationId,
  ownerId,
  memberId,
  memberRecordId,
  projectId,
] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const deviceCodes = parseTable('device-codes.json')
const sessions = parseTable('sessions.json')
const members = parseTable('members.json')
const organizations = parseTable('organizations.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

if (deviceCodes.some((row) => row.deviceCode === deviceCode)) {
  throw new Error('approved device code should be consumed after session token exchange')
}
if (!sessions.some((row) => row.token === deviceSessionToken && row.userId === memberId)) {
  throw new Error('device authorization should create a Better Auth session for the member')
}
if (!organizations.some((row) => row._id === organizationId)) {
  throw new Error('organization should remain in Better Auth component table')
}
if (!members.some((row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner')) {
  throw new Error('owner member row should remain')
}
if (members.some((row) => row._id === memberRecordId || row.userId === memberId)) {
  throw new Error('removed member should not remain in Better Auth member table')
}
if (!projects.some((row) => row._id === projectId && row.organizationId === organizationId && row.createdByAuthUserId === memberId)) {
  throw new Error('device-issued session did not create expected product row')
}
if (!auditEvents.some((row) => row.resourceId === projectId && row.actorAuthUserId === memberId && row.action === 'projects.create')) {
  throw new Error('device-issued session did not write expected product audit event')
}
if (projects.length !== 1) throw new Error(`expected 1 product row, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected 1 audit event, got ${auditEvents.length}`)
NODE

echo "better-auth device product authorization feedback loop passed"
