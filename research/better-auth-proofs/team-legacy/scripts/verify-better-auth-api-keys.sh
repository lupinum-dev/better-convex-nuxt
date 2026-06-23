#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="apikey-owner-$stamp@example.com"
member_email="apikey-member-$stamp@example.com"
viewer_email="apikey-viewer-$stamp@example.com"
outsider_email="apikey-outsider-$stamp@example.com"
org_slug="apikey-org-$stamp"

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
  if [[ "$payload" != *"$expected"* && "$status" != "$expected" ]]; then
    printf 'request failed without expected text %s: %s %s\n%s\n' "$expected" "$path" "$status" "$payload" >&2
    exit 1
  fi
}

request_json_get_failure() {
  local cookie_jar="$1"
  local path="$2"
  local expected="$3"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -G "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
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

convex_run_success_contains() {
  local label="$1"
  local expected="$2"
  local fn="$3"
  local args="$4"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.out"
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s succeeded without expected text %s\n%s\n' "$label" "$expected" "$output" >&2
    exit 1
  fi
}

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== sign up users"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
member_signup="$(request_json "$member_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Member\",\"email\":\"$member_email\",\"password\":\"$password\"}")"
viewer_signup="$(request_json "$viewer_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Viewer\",\"email\":\"$viewer_email\",\"password\":\"$password\"}")"
outsider_signup="$(request_json "$outsider_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Outsider\",\"email\":\"$outsider_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
echo "$member_signup"
echo "$viewer_signup"
echo "$outsider_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
member_id="$(printf '%s' "$member_signup" | json_field ".user.id")"
viewer_id="$(printf '%s' "$viewer_signup" | json_field ".user.id")"
outsider_id="$(printf '%s' "$outsider_signup" | json_field ".user.id")"

echo "== create organization and accept invitations"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"API Key Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
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

echo "== owner creates organization API key"
created_key="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-keys\",\"organizationId\":\"$organization_id\",\"name\":\"Deploy key\",\"prefix\":\"org\"}")"
echo "$created_key"
api_key_id="$(printf '%s' "$created_key" | json_field ".id")"
api_key_secret="$(printf '%s' "$created_key" | json_field ".key")"
api_key_start="$(printf '%s' "$created_key" | json_field ".start")"
echo "api_key_id=$api_key_id"
echo "api_key_start=$api_key_start"

echo "== HTTP verify route is not exposed by current Convex route setup"
request_json_failure "$owner_cookie" /api/auth/api-key/verify \
  "{\"configId\":\"org-keys\",\"key\":\"$api_key_secret\"}" \
  "404"

echo "== server-side Convex verification of raw API key succeeds"
convex_run_success verify-key apiKeyExperiments:verifyKey \
  "{\"configId\":\"org-keys\",\"key\":\"$api_key_secret\"}"

echo "== member can list organization API keys but cannot create them"
member_list="$(request_json_get "$member_cookie" "/api/auth/api-key/list?configId=org-keys&organizationId=$organization_id")"
echo "$member_list"
request_json_failure "$member_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-keys\",\"organizationId\":\"$organization_id\",\"name\":\"Member should fail\",\"prefix\":\"org\"}" \
  "INSUFFICIENT_API_KEY_PERMISSIONS"

echo "== viewer and outsider cannot list organization API keys"
request_json_get_failure "$viewer_cookie" "/api/auth/api-key/list?configId=org-keys&organizationId=$organization_id" \
  "INSUFFICIENT_API_KEY_PERMISSIONS"
request_json_get_failure "$outsider_cookie" "/api/auth/api-key/list?configId=org-keys&organizationId=$organization_id" \
  "USER_NOT_MEMBER_OF_ORGANIZATION"

echo "== owner updates and deletes organization API key"
updated_key="$(request_json "$owner_cookie" /api/auth/api-key/update \
  "{\"configId\":\"org-keys\",\"keyId\":\"$api_key_id\",\"name\":\"Deploy key renamed\"}")"
echo "$updated_key"
deleted_key="$(request_json "$owner_cookie" /api/auth/api-key/delete \
  "{\"configId\":\"org-keys\",\"keyId\":\"$api_key_id\"}")"
echo "$deleted_key"

echo "== deleted raw API key no longer verifies"
convex_run_success_contains verify-deleted-key "INVALID_API_KEY" apiKeyExperiments:verifyKey \
  "{\"configId\":\"org-keys\",\"key\":\"$api_key_secret\"}"

echo "== inspect auth/app tables"
capture_data "$verify_dir/api-keys.json" apikey --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth

echo "== verify API key source-of-truth state"
node - "$verify_dir" "$organization_id" "$owner_id" "$member_id" "$viewer_id" "$outsider_id" "$api_key_id" "$api_key_secret" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, memberId, viewerId, outsiderId, apiKeyId, apiKeySecret] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const apiKeys = parseTable('api-keys.json')
const members = parseTable('members.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

has(members, (row) => row.userId === ownerId && row.role === 'owner', 'owner member')
has(members, (row) => row.userId === memberId && row.role === 'member', 'member role')
has(members, (row) => row.userId === viewerId && row.role === 'viewer', 'viewer role')
if (members.some((row) => row.userId === outsiderId)) {
  throw new Error('outsider should not be a member')
}

if (apiKeys.some((row) => row._id === apiKeyId)) {
  throw new Error('deleted API key should not remain in Better Auth component table')
}
if (apiKeys.some((row) => row.key === apiKeySecret)) {
  throw new Error('raw API key secret must never be stored in component table')
}
if (apiKeys.some((row) => row.referenceId !== organizationId)) {
  throw new Error('API key referenceId must point at the owning Better Auth organization')
}
NODE

echo "better-auth API key feedback loop passed"
