#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="scim-owner-$stamp@example.com"
org_slug="scim-org-$stamp"
provider_id="scim-provider-$stamp"
scim_external_id="external-user-$stamp"
scim_email="scim-user-$stamp@example.com"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
body_file="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_SCIM_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$cookie_jar" "$body_file"
  rm -rf "$verify_dir"
}

trap cleanup EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="$3"
  local expected_status="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

request_scim_json() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="$4"
  local expected_status="$5"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/scim+json' \
    -H "Authorization: Bearer $token" \
    -H 'Origin: http://localhost:3000' \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'SCIM request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

request_scim_status() {
  local method="$1"
  local path="$2"
  local token="$3"
  local expected_status="$4"
  local status

  status=$(curl -sS -o "$body_file" -w '%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/scim+json' \
    -H "Authorization: Bearer $token" \
    -H 'Origin: http://localhost:3000')
  cat "$body_file"
  printf '\n'
  if [[ "$status" != "$expected_status" ]]; then
    printf 'SCIM request failed: %s %s expected %s\n' "$path" "$status" "$expected_status" >&2
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

echo "== enable SCIM experiment and hard reset"
pnpm exec convex env set BETTER_AUTH_SCIM_EXPERIMENT true --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== SCIM metadata endpoints"
service_config=$(curl -sS "http://127.0.0.1:3211/api/auth/scim/v2/ServiceProviderConfig")
schemas=$(curl -sS "http://127.0.0.1:3211/api/auth/scim/v2/Schemas")
resource_types=$(curl -sS "http://127.0.0.1:3211/api/auth/scim/v2/ResourceTypes")
echo "$service_config"
echo "$schemas"
echo "$resource_types"
patch_supported="$(printf '%s' "$service_config" | json_field ".patch.supported")"
if [[ "$patch_supported" != "true" ]]; then
  echo "expected SCIM patch support metadata" >&2
  exit 1
fi

echo "== sign up owner and create organization"
owner_signup="$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"SCIM Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}" \
  200)"
echo "$owner_signup"
owner_id="$(printf '%s' "$owner_signup" | json_field ".user.id")"
organization="$(request_json POST /api/auth/organization/create \
  "{\"name\":\"SCIM Org\",\"slug\":\"$org_slug\",\"plan\":\"enterprise\",\"region\":\"eu\"}" \
  200)"
echo "$organization"
organization_id="$(printf '%s' "$organization" | json_field ".id")"

echo "== reject personal SCIM token generation"
personal_token_attempt="$(request_json POST /api/auth/scim/generate-token \
  "{\"providerId\":\"personal-$provider_id\"}" \
  403)"
echo "$personal_token_attempt"

echo "== generate org-scoped SCIM token"
token_response="$(request_json POST /api/auth/scim/generate-token \
  "{\"providerId\":\"$provider_id\",\"organizationId\":\"$organization_id\"}" \
  201)"
echo "$token_response"
scim_token="$(printf '%s' "$token_response" | json_field ".scimToken")"

echo "== provision SCIM user into organization"
created_scim_user="$(request_scim_json POST /api/auth/scim/v2/Users "$scim_token" \
  "{\"userName\":\"$scim_email\",\"externalId\":\"$scim_external_id\",\"name\":{\"formatted\":\"SCIM Provisioned\",\"givenName\":\"SCIM\",\"familyName\":\"Provisioned\"},\"emails\":[{\"value\":\"$scim_email\",\"primary\":true}]}" \
  201)"
echo "$created_scim_user"
scim_user_id="$(printf '%s' "$created_scim_user" | json_field ".id")"
scim_user_name="$(printf '%s' "$created_scim_user" | json_field ".userName")"
if [[ "$scim_user_name" != "$scim_email" ]]; then
  echo "unexpected SCIM userName: $scim_user_name" >&2
  exit 1
fi

echo "== list and get SCIM user"
listed_users="$(request_scim_json GET /api/auth/scim/v2/Users "$scim_token" '{}' 200)"
echo "$listed_users"
listed_total="$(printf '%s' "$listed_users" | json_field ".totalResults")"
if [[ "$listed_total" != "1" ]]; then
  echo "expected one SCIM user, got $listed_total" >&2
  exit 1
fi
got_user="$(request_scim_json GET "/api/auth/scim/v2/Users/$scim_user_id" "$scim_token" '{}' 200)"
echo "$got_user"

echo "== inspect SCIM-created source-of-truth rows"
capture_data "$verify_dir/scim-providers-before-delete.json" scimProvider --component betterAuth
capture_data "$verify_dir/better-auth-users-before-delete.json" user --component betterAuth
capture_data "$verify_dir/better-auth-accounts-before-delete.json" account --component betterAuth
capture_data "$verify_dir/better-auth-members-before-delete.json" member --component betterAuth
capture_data "$verify_dir/app-users-before-delete.json" users

echo "== verify SCIM provisioned rows"
node - "$verify_dir" "$provider_id" "$organization_id" "$owner_id" "$scim_user_id" "$scim_email" "$scim_external_id" "$scim_token" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, providerId, organizationId, ownerId, scimUserId, scimEmail, externalId, scimToken] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '' || raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const providers = parseTable('scim-providers-before-delete.json')
const users = parseTable('better-auth-users-before-delete.json')
const accounts = parseTable('better-auth-accounts-before-delete.json')
const members = parseTable('better-auth-members-before-delete.json')
const appUsers = parseTable('app-users-before-delete.json')

const provider = providers.find((row) => row.providerId === providerId)
if (!provider) throw new Error('missing SCIM provider row')
if (provider.organizationId !== organizationId) throw new Error('SCIM provider organization mismatch')
if (provider.scimToken === scimToken) throw new Error('SCIM token must not be stored as the returned bearer token')

const ownerMember = members.find(
  (row) => row.organizationId === organizationId && row.userId === ownerId && row.role === 'owner'
)
if (!ownerMember) throw new Error('missing owner member row')

const scimUser = users.find((row) => row._id === scimUserId)
if (!scimUser) throw new Error('missing SCIM user row')
if (scimUser.email !== scimEmail) throw new Error('SCIM user email mismatch')
if (scimUser.name !== 'SCIM Provisioned') throw new Error('SCIM user name mismatch')

if (!accounts.some((row) => row.userId === scimUserId && row.providerId === providerId && row.accountId === externalId)) {
  throw new Error('missing SCIM account link')
}
if (!members.some((row) => row.organizationId === organizationId && row.userId === scimUserId && row.role === 'member')) {
  throw new Error('missing SCIM organization membership')
}
if (!appUsers.some((row) => row.authUserId === scimUserId && row.email === scimEmail)) {
  throw new Error('missing SCIM app user projection')
}
NODE

echo "== prove current Convex Better Auth route helper does not expose SCIM PUT/PATCH/DELETE"
request_scim_status PUT "/api/auth/scim/v2/Users/$scim_user_id" "$scim_token" 404
request_scim_status PATCH "/api/auth/scim/v2/Users/$scim_user_id" "$scim_token" 404
request_scim_status DELETE "/api/auth/scim/v2/Users/$scim_user_id" "$scim_token" 404

echo "better-auth SCIM partial-runtime feedback loop passed"
