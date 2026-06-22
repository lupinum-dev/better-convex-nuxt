#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="apikey-safe-delete-owner-$stamp@example.com"
org_slug="apikey-safe-delete-org-$stamp"

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

request_json_get() {
  local cookie_jar="$1"
  local path="$2"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X GET "http://127.0.0.1:3211$path" \
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
  printf '%s' "$output" > "$verify_dir/$label.out"
  if [[ "$status" == "0" ]]; then
    printf '%s unexpectedly succeeded\n' "$label" >&2
    exit 1
  fi
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s failed without expected text %s\n%s\n' "$label" "$expected" "$output" >&2
    exit 1
  fi
}

delete_keys_for_config() {
  local config_id="$1"
  local list
  local ids

  list="$(request_json_get "$owner_cookie" "/api/auth/api-key/list?configId=$config_id&organizationId=$organization_id")"
  echo "$list"
  printf '%s' "$list" > "$verify_dir/list-$config_id.json"
  ids="$(printf '%s' "$list" | node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const json = JSON.parse(input); process.stdout.write((json.apiKeys ?? []).map((key) => key.id).join('\\n')); })")"
  while IFS= read -r key_id; do
    [[ -z "$key_id" ]] && continue
    deleted="$(request_json "$owner_cookie" /api/auth/api-key/delete \
      "{\"configId\":\"$config_id\",\"keyId\":\"$key_id\"}")"
    echo "$deleted"
  done <<< "$ids"
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
  "{\"name\":\"API Key Safe Delete Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}")"
echo "$owner_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
owner_token="$(printf '%s' "$owner_signup" | json_field ".token")"

organization="$(request_json "$owner_cookie" /api/auth/organization/create \
  "{\"name\":\"API Key Safe Delete Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}")"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== create multiple organization-scoped API keys"
org_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-keys\",\"organizationId\":\"$organization_id\",\"name\":\"Org management key\"}")"
writer_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-project-writer\",\"organizationId\":\"$organization_id\",\"name\":\"Writer key\"}")"
reader_key_response="$(request_json "$owner_cookie" /api/auth/api-key/create \
  "{\"configId\":\"org-project-reader\",\"organizationId\":\"$organization_id\",\"name\":\"Reader key\"}")"
echo "$org_key_response"
echo "$writer_key_response"
echo "$reader_key_response"
org_key="$(printf '%s' "$org_key_response" | json_field ".key")"
writer_key="$(printf '%s' "$writer_key_response" | json_field ".key")"
reader_key="$(printf '%s' "$reader_key_response" | json_field ".key")"
org_key_id="$(printf '%s' "$org_key_response" | json_field ".id")"
writer_key_id="$(printf '%s' "$writer_key_response" | json_field ".id")"
reader_key_id="$(printf '%s' "$reader_key_response" | json_field ".id")"

echo "== keys verify before safe delete"
convex_run_json verify-org-before apiKeyExperiments:verifyKey \
  "{\"key\":\"$org_key\",\"configId\":\"org-keys\"}"
convex_run_json verify-writer-before apiKeyExperiments:verifyKey \
  "{\"key\":\"$writer_key\",\"configId\":\"org-project-writer\"}"
convex_run_json verify-reader-before apiKeyExperiments:verifyKey \
  "{\"key\":\"$reader_key\",\"configId\":\"org-project-reader\"}"

echo "== writer key creates product row before safe delete"
api_project_success project-before-safe-delete "$writer_key" "$organization_id" 'Before Safe Delete'
before_project_id="$(cat "$verify_dir/project-before-safe-delete.json" | json_field ".projectId")"

echo "== server-side safe delete currently fails in Convex runtime"
convex_run_failure server-side-safe-delete-limit "dynamic module import unsupported" \
  apiKeyExperiments:deleteOrganizationAfterRevokingApiKeysServerSide \
  "{\"organizationId\":\"$organization_id\",\"sessionTokenForExperiment\":\"$owner_token\"}"

echo "== route-level safe delete revokes known org-scoped API keys"
delete_keys_for_config org-keys
delete_keys_for_config org-project-writer
delete_keys_for_config org-project-reader

echo "== route-level safe delete removes organization after key revocation"
deleted_org="$(request_json "$owner_cookie" /api/auth/organization/delete \
  "{\"organizationId\":\"$organization_id\"}")"
echo "$deleted_org"
printf '%s' "$deleted_org" > "$verify_dir/safe-delete.json"

echo "== raw API keys no longer verify after safe delete"
convex_run_json verify-org-after apiKeyExperiments:verifyKey \
  "{\"key\":\"$org_key\",\"configId\":\"org-keys\"}"
convex_run_json verify-writer-after apiKeyExperiments:verifyKey \
  "{\"key\":\"$writer_key\",\"configId\":\"org-project-writer\"}"
convex_run_json verify-reader-after apiKeyExperiments:verifyKey \
  "{\"key\":\"$reader_key\",\"configId\":\"org-project-reader\"}"

echo "== product route rejects deleted writer key"
api_project_failure "$writer_key" "$organization_id" 'After Safe Delete Should Fail' 'API key organization does not exist'

echo "== inspect safe-delete tables"
capture_data "$verify_dir/api-keys.json" apikey --component betterAuth
capture_data "$verify_dir/organizations.json" organization --component betterAuth
capture_data "$verify_dir/members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify safe-delete source-of-truth state"
node - "$verify_dir" "$organization_id" "$owner_id" "$org_key_id" "$writer_key_id" "$reader_key_id" "$before_project_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, organizationId, ownerId, orgKeyId, writerKeyId, readerKeyId, beforeProjectId] =
  process.argv.slice(2)

const parseJsonObject = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
}
const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const safeDelete = parseJsonObject('safe-delete.json')
const orgKeyList = parseJsonObject('list-org-keys.json')
const writerKeyList = parseJsonObject('list-org-project-writer.json')
const readerKeyList = parseJsonObject('list-org-project-reader.json')
const verifyOrgBefore = parseJsonObject('verify-org-before.json')
const verifyWriterBefore = parseJsonObject('verify-writer-before.json')
const verifyReaderBefore = parseJsonObject('verify-reader-before.json')
const verifyOrgAfter = parseJsonObject('verify-org-after.json')
const verifyWriterAfter = parseJsonObject('verify-writer-after.json')
const verifyReaderAfter = parseJsonObject('verify-reader-after.json')
const apiKeys = parseTable('api-keys.json')
const organizations = parseTable('organizations.json')
const members = parseTable('members.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

const expectedDeleted = new Set([orgKeyId, writerKeyId, readerKeyId])
for (const keyId of expectedDeleted) {
  if (apiKeys.some((row) => row._id === keyId)) {
    throw new Error(`deleted API key ${keyId} should not remain in component table`)
  }
}
if (!orgKeyList.apiKeys?.some((key) => key.id === orgKeyId)) {
  throw new Error('org key should be listed before route-level deletion')
}
if (!writerKeyList.apiKeys?.some((key) => key.id === writerKeyId)) {
  throw new Error('writer key should be listed before route-level deletion')
}
if (!readerKeyList.apiKeys?.some((key) => key.id === readerKeyId)) {
  throw new Error('reader key should be listed before route-level deletion')
}

if (!verifyOrgBefore.valid || verifyOrgBefore.key?.id !== orgKeyId) {
  throw new Error('org key should verify before safe delete')
}
if (!verifyWriterBefore.valid || verifyWriterBefore.key?.id !== writerKeyId) {
  throw new Error('writer key should verify before safe delete')
}
if (!verifyReaderBefore.valid || verifyReaderBefore.key?.id !== readerKeyId) {
  throw new Error('reader key should verify before safe delete')
}
if (verifyOrgAfter.valid || verifyOrgAfter.error?.code !== 'INVALID_API_KEY') {
  throw new Error('org key should not verify after safe delete')
}
if (verifyWriterAfter.valid || verifyWriterAfter.error?.code !== 'INVALID_API_KEY') {
  throw new Error('writer key should not verify after safe delete')
}
if (verifyReaderAfter.valid || verifyReaderAfter.error?.code !== 'INVALID_API_KEY') {
  throw new Error('reader key should not verify after safe delete')
}
if (organizations.some((row) => row._id === organizationId)) {
  throw new Error('organization should be deleted by safe delete')
}
if (safeDelete.id !== organizationId && safeDelete.organizationId !== organizationId) {
  throw new Error('organization delete response should reference the deleted organization')
}
if (members.some((row) => row.organizationId === organizationId)) {
  throw new Error('organization members should be deleted by safe delete')
}
if (!projects.some((row) => row._id === beforeProjectId && row.createdByAuthUserId === `apiKey:${writerKeyId}`)) {
  throw new Error('pre-delete API-key product row should remain as product history')
}
if (projects.length !== 1) throw new Error(`expected one pre-delete project, got ${projects.length}`)
if (auditEvents.length !== 1) throw new Error(`expected one pre-delete audit row, got ${auditEvents.length}`)
if (!ownerId) throw new Error('owner id should be present')
NODE

echo "better-auth API key safe organization delete feedback loop passed"
