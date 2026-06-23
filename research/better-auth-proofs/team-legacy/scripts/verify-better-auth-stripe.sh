#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
password="password123"
owner_email="stripe-owner-$stamp@example.com"
outsider_email="stripe-outsider-$stamp@example.com"
org_slug="stripe-org-$stamp"

owner_cookie="$(mktemp)"
outsider_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
body_file="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_STRIPE_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$owner_cookie" "$outsider_cookie" "$body_file"
  rm -rf "$verify_dir"
}

trap cleanup EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
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

request_get() {
  local cookie_jar="$1"
  local path="$2"
  local expected_status="$3"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X GET "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

request_status() {
  local cookie_jar="$1"
  local path="$2"
  local expected_status_regex="$3"
  local status

  status=$(curl -sS -o "$body_file" -w '%{http_code}' -X GET "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
  cat "$body_file"
  printf '\n'
  if ! [[ "$status" =~ $expected_status_regex ]]; then
    printf 'request failed: %s %s expected %s\n' "$path" "$status" "$expected_status_regex" >&2
    exit 1
  fi
}

request_redirect_location() {
  local cookie_jar="$1"
  local path="$2"
  local expected_status="$3"
  local headers_file
  local status
  local location

  headers_file="$(mktemp)"
  status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -X GET "http://127.0.0.1:3211$path" \
    -H 'Origin: http://localhost:3000' \
    -b "$cookie_jar" \
    -c "$cookie_jar")
  cat "$headers_file" >&2
  printf '\n' >&2
  if [[ "$status" != "$expected_status" ]]; then
    cat "$body_file"
    printf '\nrequest failed: %s %s expected %s\n' "$path" "$status" "$expected_status" >&2
    rm -f "$headers_file"
    exit 1
  fi
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, ""); print substr($0, index($0,$2))}' "$headers_file" | tail -n 1)"
  rm -f "$headers_file"
  printf '%s' "$location"
}

capture_data() {
  local file="$1"
  shift
  pnpm exec convex data "$@" --format json --limit 100 > "$file"
  cat "$file"
  printf '\n'
}

convex_run_json() {
  local fn="$1"
  local args="$2"
  local output

  output="$(pnpm exec convex run "$fn" "$args")"
  printf '%s\n' "$output" >&2
  printf '%s' "$output" | node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const start = input.indexOf('{'); const end = input.lastIndexOf('}'); if (start < 0 || end < start) throw new Error('convex run did not return a JSON object'); process.stdout.write(JSON.stringify(JSON.parse(input.slice(start, end + 1)))); })"
}

convex_run_failure() {
  local fn="$1"
  local args="$2"
  local expected="$3"
  local output
  local status

  set +e
  output="$(pnpm exec convex run "$fn" "$args" 2>&1)"
  status="$?"
  set -e
  printf '%s\n' "$output"
  if [[ "$status" == "0" ]]; then
    printf 'expected %s to fail\n' "$fn" >&2
    exit 1
  fi
  if ! grep -Fq "$expected" <<<"$output"; then
    printf 'expected %s failure to include %s\n' "$fn" "$expected" >&2
    exit 1
  fi
}

echo "== enable Stripe experiment and hard reset"
pnpm exec convex env set BETTER_AUTH_STRIPE_EXPERIMENT true --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== sign up owner and outsider"
owner_signup=$(request_json "$owner_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Stripe Owner\",\"email\":\"$owner_email\",\"password\":\"$password\"}" \
  200)
echo "$owner_signup"
owner_id=$(printf '%s' "$owner_signup" | json_field ".user.id")
owner_token=$(printf '%s' "$owner_signup" | json_field ".token")
echo "owner_id=$owner_id"

outsider_signup=$(request_json "$outsider_cookie" POST /api/auth/sign-up/email \
  "{\"name\":\"Stripe Outsider\",\"email\":\"$outsider_email\",\"password\":\"$password\"}" \
  200)
echo "$outsider_signup"
outsider_id=$(printf '%s' "$outsider_signup" | json_field ".user.id")
echo "outsider_id=$outsider_id"

echo "== create Better Auth organization"
organization=$(request_json "$owner_cookie" POST /api/auth/organization/create \
  "{\"name\":\"Stripe Org\",\"slug\":\"$org_slug\",\"plan\":\"team\",\"region\":\"eu\"}" \
  200)
echo "$organization"
organization_id=$(printf '%s' "$organization" | json_field ".id")
echo "organization_id=$organization_id"

echo "== owner can list organization subscriptions"
owner_subscriptions=$(request_get "$owner_cookie" \
  "/api/auth/subscription/list?customerType=organization&referenceId=$organization_id" \
  200)
echo "$owner_subscriptions"

echo "== outsider cannot list organization subscriptions"
request_status "$outsider_cookie" \
  "/api/auth/subscription/list?customerType=organization&referenceId=$organization_id" \
  '^(401|403)$'

echo "== owner starts organization Stripe checkout"
checkout_response=$(request_json "$owner_cookie" POST /api/auth/subscription/upgrade \
  "{\"plan\":\"team\",\"customerType\":\"organization\",\"referenceId\":\"$organization_id\",\"successUrl\":\"http://localhost:3000/billing/success\",\"cancelUrl\":\"http://localhost:3000/billing/cancel\",\"disableRedirect\":true,\"metadata\":{\"source\":\"stripe-feedback-$stamp\"}}" \
  200)
echo "$checkout_response"
checkout_id=$(printf '%s' "$checkout_response" | json_field ".id")
checkout_url=$(printf '%s' "$checkout_response" | json_field ".url")
checkout_redirect=$(printf '%s' "$checkout_response" | json_field ".redirect")
checkout_reference_id=$(printf '%s' "$checkout_response" | json_field ".client_reference_id")
checkout_subscription_id=$(printf '%s' "$checkout_response" | json_field ".metadata.subscriptionId")
if [[ "$checkout_redirect" != "false" ]]; then
  echo "expected Stripe checkout disableRedirect response redirect=false" >&2
  exit 1
fi
if [[ "$checkout_url" != "http://localhost:3000/billing/local-checkout" ]]; then
  echo "unexpected local Stripe checkout URL: $checkout_url" >&2
  exit 1
fi
if [[ "$checkout_reference_id" != "$organization_id" ]]; then
  echo "unexpected Stripe checkout reference id: $checkout_reference_id" >&2
  exit 1
fi
if [[ "$checkout_id" != "cs_local_$checkout_subscription_id" ]]; then
  echo "unexpected local checkout id $checkout_id for subscription $checkout_subscription_id" >&2
  exit 1
fi

echo "== subscription list still excludes incomplete checkout row"
post_checkout_subscriptions=$(request_get "$owner_cookie" \
  "/api/auth/subscription/list?customerType=organization&referenceId=$organization_id" \
  200)
echo "$post_checkout_subscriptions"

echo "== product entitlement rejects incomplete subscription"
convex_run_failure stripeEntitlementExperiments:createProjectWithPlanLimit \
  "{\"organizationId\":\"$organization_id\",\"name\":\"Before Activation\",\"sessionTokenForExperiment\":\"$owner_token\"}" \
  "Active subscription required"

echo "== checkout success activates Better Auth subscription row"
success_location=$(request_redirect_location "$owner_cookie" \
  "/api/auth/subscription/success?callbackURL=http%3A%2F%2Flocalhost%3A3000%2Fbilling%2Fsuccess&checkoutSessionId=$checkout_id" \
  302)
echo "$success_location"
if [[ "$success_location" != "http://localhost:3000/billing/success" ]]; then
  echo "unexpected Stripe success redirect location: $success_location" >&2
  exit 1
fi

echo "== subscription list includes active subscription after success"
active_subscriptions=$(request_get "$owner_cookie" \
  "/api/auth/subscription/list?customerType=organization&referenceId=$organization_id" \
  200)
echo "$active_subscriptions"

echo "== product entitlement allows exactly the plan project limit"
for project_number in $(seq 1 10); do
  convex_run_json stripeEntitlementExperiments:createProjectWithPlanLimit \
    "{\"organizationId\":\"$organization_id\",\"name\":\"Plan Project $project_number\",\"sessionTokenForExperiment\":\"$owner_token\"}"
  printf '\n'
done

echo "== product entitlement rejects the next project after the plan limit"
convex_run_failure stripeEntitlementExperiments:createProjectWithPlanLimit \
  "{\"organizationId\":\"$organization_id\",\"name\":\"Plan Project 11\",\"sessionTokenForExperiment\":\"$owner_token\"}" \
  "Project limit reached for team plan"

echo "== inspect Stripe-owned Better Auth tables and app tables"
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/better-auth-subscriptions.json" subscription --component betterAuth
capture_data "$verify_dir/app-users.json" users
capture_data "$verify_dir/app-projects.json" projects
capture_data "$verify_dir/app-audit-events.json" auditEvents

echo "== verify Stripe experiment source-of-truth state"
node - "$verify_dir" "$organization_id" "$owner_id" "$outsider_id" "$owner_subscriptions" "$post_checkout_subscriptions" "$active_subscriptions" "$checkout_subscription_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [
  verifyDir,
  organizationId,
  ownerId,
  outsiderId,
  ownerSubscriptionsRaw,
  postCheckoutSubscriptionsRaw,
  activeSubscriptionsRaw,
  checkoutSubscriptionId,
] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const organizations = parseTable('better-auth-organizations.json')
const members = parseTable('better-auth-members.json')
const subscriptions = parseTable('better-auth-subscriptions.json')
const appUsers = parseTable('app-users.json')
const appProjects = parseTable('app-projects.json')
const appAuditEvents = parseTable('app-audit-events.json')
const ownerSubscriptions = JSON.parse(ownerSubscriptionsRaw)
const postCheckoutSubscriptions = JSON.parse(postCheckoutSubscriptionsRaw)
const activeSubscriptions = JSON.parse(activeSubscriptionsRaw)

if (!Array.isArray(ownerSubscriptions) || ownerSubscriptions.length !== 0) {
  throw new Error('expected organization subscription list to return an empty array')
}
if (!Array.isArray(postCheckoutSubscriptions) || postCheckoutSubscriptions.length !== 0) {
  throw new Error('incomplete checkout subscription should not appear in active subscription list')
}
if (!Array.isArray(activeSubscriptions) || activeSubscriptions.length !== 1) {
  throw new Error('expected active subscription list to include the activated checkout subscription')
}
if (subscriptions.length !== 1) {
  throw new Error(`expected one Better Auth subscription row from checkout, got ${subscriptions.length}`)
}
const subscription = subscriptions[0]
if (subscription._id !== checkoutSubscriptionId) {
  throw new Error('checkout metadata subscription id should match Better Auth subscription row id')
}
if (subscription.referenceId !== organizationId) {
  throw new Error('subscription should reference the Better Auth organization id')
}
if (subscription.plan !== 'team') {
  throw new Error('subscription should store the selected plan')
}
if (subscription.status !== 'active') {
  throw new Error('checkout success should activate the Better Auth subscription row')
}
if (subscription.stripeCustomerId !== `cus_local_${organizationId}`) {
  throw new Error('subscription should store the local Stripe organization customer id')
}
if (subscription.stripeSubscriptionId !== `sub_local_${checkoutSubscriptionId}`) {
  throw new Error('subscription should store the Stripe subscription id from checkout success')
}
if (subscription.billingInterval !== 'month') {
  throw new Error('subscription should store billing interval from Stripe subscription item')
}
if (typeof subscription.periodStart !== 'number' || typeof subscription.periodEnd !== 'number') {
  throw new Error('subscription should store billing period timestamps after checkout success')
}
if (subscription.seats !== 1) {
  throw new Error('subscription should store default seat quantity')
}
if (activeSubscriptions[0].id !== checkoutSubscriptionId) {
  throw new Error('active subscription list should expose the Better Auth subscription id')
}
if (activeSubscriptions[0].limits?.projects !== 10) {
  throw new Error('active subscription list should include plan limits from Better Auth Stripe config')
}
if (
  !organizations.some(
    (row) =>
      row._id === organizationId &&
      row.plan === 'team' &&
      row.stripeCustomerId === `cus_local_${organizationId}`,
  )
) {
  throw new Error('expected Better Auth organization row with local Stripe customer id')
}
if (!members.some((row) => row.organizationId === organizationId && row.userId === ownerId)) {
  throw new Error('expected owner membership to authorize subscription listing')
}
if (members.some((row) => row.organizationId === organizationId && row.userId === outsiderId)) {
  throw new Error('outsider should not gain membership through Stripe subscription list')
}
if (!appUsers.some((row) => row.authUserId === ownerId)) {
  throw new Error('expected app user projection for owner')
}
if (!appUsers.some((row) => row.authUserId === outsiderId)) {
  throw new Error('expected app user projection for outsider')
}
if (appProjects.length !== 10) {
  throw new Error(`expected product entitlement probe to write 10 projects, got ${appProjects.length}`)
}
if (!appProjects.every((row) => row.organizationId === organizationId)) {
  throw new Error('all entitlement projects should reference the Better Auth organization id')
}
if (!appProjects.every((row) => row.createdByAuthUserId === ownerId)) {
  throw new Error('all entitlement projects should reference the Better Auth owner id')
}
if (appAuditEvents.length !== 10) {
  throw new Error(`expected 10 project audit rows, got ${appAuditEvents.length}`)
}
if (!appAuditEvents.every((row) => row.action === 'projects.createWithPlanLimit')) {
  throw new Error('expected entitlement audit action for all project writes')
}
NODE

echo "better-auth Stripe feedback loop passed"
