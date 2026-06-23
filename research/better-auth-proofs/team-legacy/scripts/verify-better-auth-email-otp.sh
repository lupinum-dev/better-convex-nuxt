#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
otp="123456"
password="password123"
passwordless_email="email-otp-passwordless-$stamp@example.com"
verification_email="email-otp-verify-$stamp@example.com"

passwordless_cookie="$(mktemp)"
verification_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$passwordless_cookie" "$verification_cookie"; rm -rf "$verify_dir"' EXIT

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

echo "== send passwordless sign-in OTP"
sent_signin="$(request_json "$passwordless_cookie" /api/auth/email-otp/send-verification-otp \
  "{\"email\":\"$passwordless_email\",\"type\":\"sign-in\"}")"
echo "$sent_signin"
capture_data "$verify_dir/verification-after-signin-send.json" verification --component betterAuth

echo "== passwordless sign-in auto-creates user"
signin="$(request_json "$passwordless_cookie" /api/auth/sign-in/email-otp \
  "{\"email\":\"$passwordless_email\",\"otp\":\"$otp\",\"name\":\"Email OTP Passwordless\"}")"
echo "$signin"
passwordless_user_id="$(printf '%s' "$signin" | json_field ".user.id")"
passwordless_token="$(printf '%s' "$signin" | json_field ".token")"
if [[ -z "$passwordless_token" || "$passwordless_token" == "null" ]]; then
  echo "passwordless sign-in did not return token" >&2
  exit 1
fi
capture_data "$verify_dir/verification-after-signin.json" verification --component betterAuth

echo "== passwordless OTP replay is rejected"
request_json_failure "$passwordless_cookie" /api/auth/sign-in/email-otp \
  "{\"email\":\"$passwordless_email\",\"otp\":\"$otp\",\"name\":\"Replay\"}" \
  "INVALID_OTP"

echo "== sign up password user for email verification"
signup="$(request_json "$verification_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Email OTP Verify\",\"email\":\"$verification_email\",\"password\":\"$password\"}")"
echo "$signup"
verification_user_id="$(printf '%s' "$signup" | json_field ".user.id")"

echo "== send email-verification OTP"
sent_verification="$(request_json "$verification_cookie" /api/auth/email-otp/send-verification-otp \
  "{\"email\":\"$verification_email\",\"type\":\"email-verification\"}")"
echo "$sent_verification"
capture_data "$verify_dir/verification-after-email-verification-send.json" verification --component betterAuth

echo "== verify email with OTP"
verified_email="$(request_json "$verification_cookie" /api/auth/email-otp/verify-email \
  "{\"email\":\"$verification_email\",\"otp\":\"$otp\"}")"
echo "$verified_email"
capture_data "$verify_dir/verification-after-email-verification.json" verification --component betterAuth
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify email OTP state"
node - "$verify_dir" "$otp" "$passwordless_email" "$passwordless_user_id" "$verification_email" "$verification_user_id" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, otp, passwordlessEmail, passwordlessUserId, verificationEmail, verificationUserId] =
  process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const signInVerificationRows = parseTable('verification-after-signin-send.json')
const afterSignInRows = parseTable('verification-after-signin.json')
const emailVerificationRows = parseTable('verification-after-email-verification-send.json')
const afterEmailVerificationRows = parseTable('verification-after-email-verification.json')
const betterAuthUsers = parseTable('better-auth-users.json')
const appUsers = parseTable('app-users.json')

const signInIdentifier = `sign-in-otp-${passwordlessEmail}`
const emailVerificationIdentifier = `email-verification-otp-${verificationEmail}`

const signInOtpRow = signInVerificationRows.find((row) => row.identifier === signInIdentifier)
if (!signInOtpRow) throw new Error('missing sign-in OTP verification row')
if (signInOtpRow.value.includes(otp)) throw new Error('raw sign-in OTP leaked into verification table')
if (afterSignInRows.some((row) => row.identifier === signInIdentifier)) {
  throw new Error('sign-in OTP row should be consumed after successful sign-in')
}

const emailVerificationOtpRow = emailVerificationRows.find(
  (row) => row.identifier === emailVerificationIdentifier,
)
if (!emailVerificationOtpRow) throw new Error('missing email-verification OTP row')
if (emailVerificationOtpRow.value.includes(otp)) {
  throw new Error('raw email-verification OTP leaked into verification table')
}
if (afterEmailVerificationRows.some((row) => row.identifier === emailVerificationIdentifier)) {
  throw new Error('email-verification OTP row should be consumed after verification')
}

const passwordlessUser = betterAuthUsers.find((row) => row._id === passwordlessUserId)
if (!passwordlessUser || passwordlessUser.emailVerified !== true) {
  throw new Error('passwordless sign-in should create a verified Better Auth user')
}
const verificationUser = betterAuthUsers.find((row) => row._id === verificationUserId)
if (!verificationUser || verificationUser.emailVerified !== true) {
  throw new Error('email verification should mark Better Auth user verified')
}
if (!appUsers.some((row) => row.authUserId === passwordlessUserId)) {
  throw new Error('passwordless app user projection missing')
}
if (!appUsers.some((row) => row.authUserId === verificationUserId)) {
  throw new Error('verified app user projection missing')
}
NODE

echo "better-auth email OTP feedback loop passed"
