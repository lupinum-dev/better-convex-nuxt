#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="apikey-route-owner-$stamp@example.com"
org_slug="apikey-route-org-$stamp"
other_org_slug="apikey-route-other-org-$stamp"

owner_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$owner_cookie"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

convex_json_field() {
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

convex_run_json() {
  local label="$1"
  local fn="$2"
  local args="$3"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output"
  printf '%s' "$output" > "$verify_dir/$label.json"
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

echo "== sign up owner"
owner_signup="$(request_json "$owner_cookie" /api/auth/sign-up/email \
  "{\"name\":\"API Key Route Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"

echo "== create organization"
organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"API Key Route Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== create other organization"
other_organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"API Key Route Other Org\",\"slug\":\"$other_org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$other_organization"
other_organization_id="$(printf '%s' "$other_organization" | json_field ".id")"

echo "== create server-scoped org API keys"
writer_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-project-writer\",\"organizationId\":\"$organization_id\",\"name\":\"Project writer\"}")"
echo "$writer_key_response"
printf '%s' "$writer_key_response" > "$verify_dir/create-key.json"
writer_key="$(printf '%s' "$writer_key_response" | json_field ".key")"
writer_key_id="$(printf '%s' "$writer_key_response" | json_field ".id")"

reader_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-project-reader\",\"organizationId\":\"$organization_id\",\"name\":\"Project reader\"}")"
echo "$reader_key_response"
printf '%s' "$reader_key_response" > "$verify_dir/read-key.json"
reader_key="$(printf '%s' "$reader_key_response" | json_field ".key")"

echo "== writer key creates product row through HTTP route"
api_project_success project-create "$writer_key" "$organization_id" 'API Key Project'
project_id="$(cat "$verify_dir/project-create.json" | json_field ".projectId")"
created_api_key_id="$(cat "$verify_dir/project-create.json" | json_field ".apiKeyId")"

echo "== reader key cannot create product row"
api_project_failure "$reader_key" "$organization_id" 'Reader Should Fail' 'INVALID_API_KEY'

echo "== writer key cannot create into another organization"
api_project_failure "$writer_key" "$other_organization_id" 'Wrong Org Should Fail' 'API key organization mismatch'

echo "== writer key cannot create into malformed organization id"
api_project_failure "$writer_key" 'kn_fake_other_org' 'Malformed Org Should Fail' 'API key organization does not exist'

echo "== inspect auth/product tables"
capture_data "$verify_dir/api-keys.json" apikey --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify API key product route state"
node - "$verify_dir" "$organization_id" "$owner_id" "$writer_key_id" "$created_api_key_id" "$project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, writerKeyId, createdApiKeyId, projectId] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const apiKeys = parseTable('api-keys.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

const has = (rows, predicate, label) => {
  if (!rows.some(predicate)) throw new Error(`missing expected ${label}`)
}

if (writerKeyId !== createdApiKeyId) {
  throw new Error('HTTP route should report the writer API key id')
}

has(apiKeys, (row) => {
  if (row._id !== writerKeyId || row.referenceId !== organizationId) return false
  const permissions = row.permissions ? JSON.parse(row.permissions) : null
  return permissions?.project?.includes('create')
}, 'writer API key permissions')
has(projects, (row) => {
  return (
    row._id === projectId &&
    row.organizationId === organizationId &&
    row.createdByAuthUserId === `apiKey:${writerKeyId}`
  )
}, 'project created by API key')
has(auditEvents, (row) => {
  return (
    row.resourceId === projectId &&
    row.actorAuthUserId === `apiKey:${writerKeyId}` &&
    row.action === 'projects.createFromApiKey'
  )
}, 'API key audit event')

if (!ownerId) throw new Error('owner id should be present')
if (projects.length !== 1) throw new Error(`expected 1 project, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected 1 audit event, got ${auditEvents.length}`)
NODE

echo "better-auth API key product route feedback loop passed"
