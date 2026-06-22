#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
code="proxy-code-$stamp"
preview_origin="http://127.0.0.1:3000"
production_origin="http://localhost:3000"
callback_url="$preview_origin/oauth/proxy-done"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
headers_file="$(mktemp)"
body_file="$(mktemp)"

cleanup() {
  pnpm exec convex env remove BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  pnpm exec convex env remove BETTER_AUTH_OAUTH_PROXY_EXPERIMENT --deployment local >/dev/null 2>&1 || true
  rm -f "$cookie_jar" "$headers_file" "$body_file"
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
  local origin="${5:-$preview_origin}"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X "$method" "http://127.0.0.1:3211$path" \
    -H 'Content-Type: application/json' \
    -H "Origin: $origin" \
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

capture_data() {
  local file="$1"
  shift
  pnpm exec convex data "$@" --format json --limit 100 > "$file"
  cat "$file"
  printf '\n'
}

echo "== enable generic OAuth plus OAuth proxy experiment and hard reset"
pnpm exec convex env set BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT true --deployment local >/dev/null
pnpm exec convex env set BETTER_AUTH_OAUTH_PROXY_EXPERIMENT true --deployment local >/dev/null
pnpm experiment:hard-reset >/dev/null

echo "== start proxied social sign-in through generic provider"
signin="$(request_json POST /api/auth/sign-in/social \
  "{\"provider\":\"local-generic-oauth\",\"callbackURL\":\"$callback_url\",\"disableRedirect\":true,\"requestSignUp\":true,\"scopes\":[\"profile\",\"email\"],\"additionalData\":{\"trace\":\"oauth-proxy-$stamp\"}}" \
  200)"
echo "$signin"
auth_url="$(printf '%s' "$signin" | json_field ".url")"
redirect="$(printf '%s' "$signin" | json_field ".redirect")"
if [[ "$redirect" != "false" ]]; then
  echo "expected disableRedirect response redirect=false" >&2
  exit 1
fi

provider_host="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.origin)" "$auth_url")"
client_id="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('client_id') || '')" "$auth_url")"
redirect_uri="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('redirect_uri') || '')" "$auth_url")"
encrypted_state="$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$auth_url")"
if [[ "$provider_host" != "http://localhost:3999" ]]; then
  echo "unexpected OAuth proxy provider host: $provider_host" >&2
  exit 1
fi
if [[ "$client_id" != "local-generic-client" ]]; then
  echo "unexpected OAuth proxy client id: $client_id" >&2
  exit 1
fi
if [[ "$redirect_uri" != "$production_origin/api/auth/oauth2/callback/local-generic-oauth" ]]; then
  echo "unexpected OAuth proxy generic redirect_uri: $redirect_uri" >&2
  exit 1
fi
if [[ -z "$encrypted_state" ]]; then
  echo "missing OAuth proxy encrypted state" >&2
  exit 1
fi

echo "== inspect OAuth state before production callback"
capture_data "$verify_dir/verifications-before-callback.json" verification --component betterAuth

original_state="$(node - "$verify_dir" "$encrypted_state" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, encryptedState] = process.argv.slice(2)
const raw = fs.readFileSync(path.join(verifyDir, 'verifications-before-callback.json'), 'utf8')
const rows = raw.includes('There are no documents') ? [] : JSON.parse(raw)
if (rows.length !== 1) throw new Error(`expected one OAuth proxy state row, got ${rows.length}`)
const [stateRow] = rows
if (stateRow.identifier === encryptedState) {
  throw new Error('provider URL should contain encrypted proxy state, not raw verification identifier')
}
const value = JSON.parse(stateRow.value)
if (value.callbackURL !== 'http://127.0.0.1:3000/api/auth/oauth-proxy-callback?callbackURL=http%3A%2F%2F127.0.0.1%3A3000%2Foauth%2Fproxy-done') {
  throw new Error(`unexpected proxied callbackURL: ${value.callbackURL}`)
}
process.stdout.write(stateRow.identifier)
NODE
)"
if [[ -z "$original_state" ]]; then
  echo "missing original OAuth proxy verification identifier" >&2
  exit 1
fi

echo "== generic OAuth callback cannot consume OAuth proxy encrypted state"
generic_callback_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "http://127.0.0.1:3211/api/auth/oauth2/callback/local-generic-oauth" \
  -H "Origin: $production_origin" \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "code=$code" \
  --data-urlencode "state=$encrypted_state")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$generic_callback_status" != "302" ]]; then
  echo "expected generic OAuth proxy callback attempt to redirect with an error, got $generic_callback_status" >&2
  exit 1
fi
error_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)"
if [[ "$error_location" != *"state_mismatch"* && "$error_location" != *"state_security_mismatch"* ]]; then
  echo "expected generic OAuth proxy callback attempt to fail with state mismatch: $error_location" >&2
  exit 1
fi

echo "== inspect OAuth proxy expected-limit tables"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-accounts.json" account --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/verifications-after-callback.json" verification --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify OAuth proxy generic-OAuth expected limit"
node - "$verify_dir" "$original_state" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, originalState] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '' || raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const users = parseTable('better-auth-users.json')
const accounts = parseTable('better-auth-accounts.json')
const sessions = parseTable('better-auth-sessions.json')
const verificationsAfter = parseTable('verifications-after-callback.json')
const appUsers = parseTable('app-users.json')

if (!verificationsAfter.some((row) => row.identifier === originalState)) {
  throw new Error('expected OAuth proxy state row to remain after incompatible generic OAuth callback')
}
if (users.length !== 0) throw new Error('OAuth proxy generic limit should not create Better Auth users')
if (accounts.length !== 0) throw new Error('OAuth proxy generic limit should not create account rows')
if (sessions.length !== 0) throw new Error('OAuth proxy generic limit should not create sessions')
if (appUsers.length !== 0) throw new Error('OAuth proxy generic limit should not create app user projections')
NODE

echo "better-auth OAuth proxy generic-OAuth expected-limit feedback loop passed"
