#!/usr/bin/env bash
set -euo pipefail

email="agent-feedback-$(date +%s)@example.com"
password="password123"
initial_org_name="Agent Feedback Org"
renamed_org_name="Agent Feedback Org Renamed"
project_name="Agent Feedback Project"

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== better-auth sign-up"
signup_response=$(curl -sS -X POST http://127.0.0.1:3211/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  --data "{\"name\":\"Agent Feedback User\",\"email\":\"$email\",\"password\":\"$password\"}")
echo "$signup_response"

auth_user_id=$(printf '%s' "$signup_response" | json_field ".user.id")
echo "auth_user_id=$auth_user_id"

echo "== create org through authenticated Convex mutation"
organization_id=$(pnpm exec convex run organizations:create "{\"name\":\"$initial_org_name\"}" \
  --identity "{\"subject\":\"$auth_user_id\"}" | tail -n 1 | tr -d '"')
echo "organization_id=$organization_id"

echo "== create project through authenticated Convex mutation"
project_id=$(pnpm exec convex run projects:create "{\"organizationId\":\"$organization_id\",\"name\":\"$project_name\"}" \
  --identity "{\"subject\":\"$auth_user_id\"}" | tail -n 1 | tr -d '"')
echo "project_id=$project_id"

echo "== rename org through gated experiment mutation"
pnpm exec convex run experiments:renameOrganizationForExperiment \
  "{\"organizationId\":\"$organization_id\",\"name\":\"$renamed_org_name\"}"

echo "== app users"
pnpm exec convex data users --format json --limit 20

echo "== betterAuth users"
pnpm exec convex data user --component betterAuth --format json --limit 20

echo "== organizations"
pnpm exec convex data organizations --format json --limit 20

echo "== memberships"
pnpm exec convex data memberships --format json --limit 20

echo "== projects"
pnpm exec convex data projects --format json --limit 20

echo "== audit events"
pnpm exec convex data auditEvents --format json --limit 20

echo "== verify"
pnpm experiment:verify
