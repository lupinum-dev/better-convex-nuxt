#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="apikey-lifecycle-owner-$stamp@example.com"
org_slug="apikey-lifecycle-org-$stamp"

owner_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie"; rm -rf "$verify_dir"' EXIT

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

api_project_success() {
  local label="$1"
  local key="$2"
  local organization_id="$3"
  local name="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X POST 'http://127.0.0.1:3211/api/projects' \
    -H 'Content-Type: application/json' \
    -H "x-api-key: $key" \
    --data "{\"organizationId\":\"$organization_id\",\"name\":\"$name\"}")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  printf '%s\n' "$payload"
  printf '%s' "$payload" > "$verify_dir/$label.json"
  if [[ "$status" != "200" ]]; then
    printf 'api project request failed: %s\n%s\n' "$status" "$payload" >&2
    exit 1
  fi
}

api_project_failure() {
  local key="$1"
  local organization_id="$2"
  local name="$3"
  local expected="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X POST 'http://127.0.0.1:3211/api/projects' \
    -H 'Content-Type: application/json' \
    -H "x-api-key: $key" \
    --data "{\"organizationId\":\"$organization_id\",\"name\":\"$name\"}")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  printf '%s\n' "$payload"
  if [[ "$status" == "200" ]]; then
    printf 'api project request unexpectedly succeeded\n%s\n' "$payload" >&2
    exit 1
  fi
  if [[ "$payload" != *"$expected"* ]]; then
    printf 'api project request failed without expected text %s: %s\n%s\n' "$expected" "$status" "$payload" >&2
    exit 1
  fi
}

convex_run_json() {
  local label="$1"
  local fn="$2"
  local args="$3"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.json"
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

echo "== sign up owner and create organization"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Lifecycle Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"

organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"API Key Lifecycle Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== create organization-scoped writer key"
writer_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-project-writer\",\"organizationId\":\"$organization_id\",\"name\":\"Lifecycle writer\"}")"
echo "$writer_key_response"
writer_key="$(printf '%s' "$writer_key_response" | json_field ".key")"
writer_key_id="$(printf '%s' "$writer_key_response" | json_field ".id")"

echo "== key creates product row while organization exists"
api_project_success project-before-delete "$writer_key" "$organization_id" 'Before Org Delete'
before_project_id="$(cat "$verify_dir/project-before-delete.json" | json_field ".projectId")"

echo "== delete organization through Better Auth"
deleted_org="$(request_json "$owner_cookie" /api/auth/organization/delete \
  "{\"organizationId\":\"$organization_id\"}")"
echo "$deleted_org"

echo "== raw API key still verifies after organization deletion"
convex_run_json verify-after-delete apiKeyExperiments:verifyKey \
  "{\"key\":\"$writer_key\",\"configId\":\"org-project-writer\"}"

echo "== product route rejects surviving key for deleted organization"
api_project_failure "$writer_key" "$organization_id" 'After Org Delete Should Fail' 'API key organization does not exist'

echo "== inspect API key lifecycle tables"
capture_data "$verify_dir/api-keys.json" apikey --component betterAuth
capture_data "$verify_dir/organizations.json" organization --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify API key lifecycle source-of-truth state"
node - "$verify_dir" "$organization_id" "$owner_id" "$writer_key_id" "$before_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, writerKeyId, beforeProjectId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const verifyRaw = fs.readFileSync(path.join(verifyDir, 'verify-after-delete.json'), 'utf8')
const verifyOutput = JSON.parse(
  verifyRaw.slice(verifyRaw.indexOf('{'), verifyRaw.lastIndexOf('}') + 1)
)
const apiKeys = parseTable('api-keys.json')
const organizations = parseTable('organizations.json')
const members = parseTable('members.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

if (!verifyOutput.valid || verifyOutput.key?.id !== writerKeyId) {
  throw new Error('Better Auth verifyApiKey should still validate the raw key after org deletion')
}
has(apiKeys, (row) => row._id === writerKeyId && row.referenceId === organizationId, 'surviving API key row')
if (organizations.some((row) => row._id === organizationId)) {
  throw new Error('deleted organization should not remain in Better Auth organization table')
}
if (members.some((row) => row.organizationId === organizationId)) {
  throw new Error('deleted organization should not retain Better Auth member rows')
}
has(projects, (row) => row._id === beforeProjectId && row.createdByAuthUserId === `apiKey:${writerKeyId}`, 'pre-delete API key project')
has(auditEvents, (row) => row.resourceId === beforeProjectId && row.actorAuthUserId === `apiKey:${writerKeyId}`, 'pre-delete API key audit')
if (projects.length !== 1) throw new Error(`expected only the pre-delete project, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected only the pre-delete audit event, got ${auditEvents.length}`)
if (!ownerId) throw new Error('owner id should be present')
NODE

echo "better-auth API key lifecycle feedback loop passed"
