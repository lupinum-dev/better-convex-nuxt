#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="passkey-user-$stamp@example.com"
password="password123"
cookie_jar="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$cookie_jar"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local response
  local status
  local payload

  if [[ "$method" == "GET" ]]; then
    response=$(curl -sS -w '\n%{http_code}' "http://127.0.0.1:3211$path" \
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
  if [[ "$status" != "200" ]]; then
    printf 'request failed: %s %s %s\n%s\n' "$method" "$path" "$status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
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

echo "== verify passkey package exports"
node <<'NODE'
const server = require.resolve('@better-auth/passkey', { paths: [process.cwd()] })
const client = require.resolve('@better-auth/passkey/client', { paths: [process.cwd()] })
console.log(JSON.stringify({ server, client }))
NODE

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== sign up user for passkey option generation"
signup="$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"Passkey User\",\"email\":\"$email\",\"password\":\"$password\"}")"
echo "$signup"
user_id="$(printf '%s' "$signup" | json_field ".user.id")"
echo "user_id=$user_id"

echo "== generate authenticated passkey registration options"
registration_options="$(request_json GET '/api/auth/passkey/generate-register-options?name=MacBook%20Touch%20ID')"
echo "$registration_options"
printf '%s' "$registration_options" > "$verify_dir/registration-options.json"

echo "== generate passkey authentication options"
authentication_options="$(request_json GET /api/auth/passkey/generate-authenticate-options)"
echo "$authentication_options"
printf '%s' "$authentication_options" > "$verify_dir/authentication-options.json"

echo "== list passkeys before browser WebAuthn registration"
passkeys="$(request_json GET /api/auth/passkey/list-user-passkeys)"
echo "$passkeys"
printf '%s' "$passkeys" > "$verify_dir/list-passkeys.json"

echo "== inspect passkey component tables"
capture_data "$verify_dir/better-auth-passkeys.json" passkey --component betterAuth
capture_data "$verify_dir/better-auth-verifications.json" verification --component betterAuth
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth

echo "== verify passkey runtime boundary"
node - "$verify_dir" "$user_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, userId] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '') return []
  if (raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const registration = JSON.parse(
  fs.readFileSync(path.join(verifyDir, 'registration-options.json'), 'utf8'),
)
const authentication = JSON.parse(
  fs.readFileSync(path.join(verifyDir, 'authentication-options.json'), 'utf8'),
)
const listed = JSON.parse(fs.readFileSync(path.join(verifyDir, 'list-passkeys.json'), 'utf8'))
const passkeys = parseTable('better-auth-passkeys.json')
const verifications = parseTable('better-auth-verifications.json')
const users = parseTable('better-auth-users.json')

if (typeof registration.challenge !== 'string' || registration.challenge.length < 16) {
  throw new Error('registration options did not include a challenge')
}
if (registration.rp?.id !== 'localhost') {
  throw new Error(`registration rp.id mismatch: ${registration.rp?.id}`)
}
if (registration.rp?.name !== 'Better Convex Nuxt Team') {
  throw new Error(`registration rp.name mismatch: ${registration.rp?.name}`)
}
if (typeof registration.user?.id !== 'string' || registration.user.id === userId) {
  throw new Error('registration options should expose an encoded WebAuthn user handle')
}
if (!Array.isArray(registration.pubKeyCredParams) || registration.pubKeyCredParams.length === 0) {
  throw new Error('registration options missing credential params')
}
if (typeof authentication.challenge !== 'string' || authentication.challenge.length < 16) {
  throw new Error('authentication options did not include a challenge')
}
if (!Array.isArray(listed) || listed.length !== 0) {
  throw new Error(`expected no registered passkeys before WebAuthn verification, got ${JSON.stringify(listed)}`)
}
if (passkeys.length !== 0) {
  throw new Error(`passkey table should be empty before browser verification, got ${passkeys.length}`)
}
if (!users.some((row) => row._id === userId)) {
  throw new Error('missing Better Auth user row')
}
if (verifications.length < 1) {
  throw new Error('expected WebAuthn challenge verification rows')
}
const decodedChallenges = verifications.map((row) => JSON.parse(row.value))
if (!decodedChallenges.some((row) => row.type === 'registration' && row.userData?.id === userId)) {
  throw new Error('registration challenge row did not store the Better Auth user id')
}
if (!decodedChallenges.some((row) => row.type === 'authentication' && row.userData?.id === userId)) {
  throw new Error('authentication challenge row did not store the Better Auth user id')
}
NODE

echo "better-auth passkey runtime boundary feedback loop passed"
