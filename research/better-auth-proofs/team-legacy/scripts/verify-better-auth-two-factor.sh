#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="two-factor-$stamp@example.com"
password="password123"

primary_cookie="$(mktemp)"
challenge_cookie="$(mktemp)"
backup_cookie="$(mktemp)"
reuse_cookie="$(mktemp)"
verify_dir="$(mktemp -d)"
trap 'rm -f "$primary_cookie" "$challenge_cookie" "$backup_cookie" "$reuse_cookie"; rm -rf "$verify_dir"' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

json_string() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$1"
}

totp_from_uri() {
  node - "$1" <<'NODE'
const crypto = require('node:crypto')

const uri = new URL(process.argv[2])
const secret = uri.searchParams.get('secret')
const period = Number(uri.searchParams.get('period') || 30)
const digits = Number(uri.searchParams.get('digits') || 6)
if (!secret) throw new Error('TOTP URI is missing secret')

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/=+$/g, '')
  let bits = ''
  for (const char of clean) {
    const value = alphabet.indexOf(char)
    if (value < 0) throw new Error(`Invalid base32 character: ${char}`)
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

const counter = Math.floor(Date.now() / 1000 / period)
const counterBuffer = Buffer.alloc(8)
counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
counterBuffer.writeUInt32BE(counter >>> 0, 4)

const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest()
const offset = hmac[hmac.length - 1] & 0x0f
const value =
  ((hmac[offset] & 0x7f) << 24) |
  ((hmac[offset + 1] & 0xff) << 16) |
  ((hmac[offset + 2] & 0xff) << 8) |
  (hmac[offset + 3] & 0xff)

process.stdout.write(String(value % 10 ** digits).padStart(digits, '0'))
NODE
}

assert_json() {
  local json="$1"
  local expression="$2"
  local label="$3"

  node -e '
const expression = process.argv[1]
const label = process.argv[2]
let input = ""
process.stdin.on("data", (chunk) => {
  input += chunk
})
process.stdin.on("end", () => {
  const data = JSON.parse(input)
  const passed = Function("data", `return (${expression})`)(data)
  if (!passed) {
    throw new Error(`Assertion failed: ${label}\n${JSON.stringify(data, null, 2)}`)
  }
})
' "$expression" "$label" <<<"$json"
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

echo "== sign up user"
signup="$(request_json "$primary_cookie" /api/auth/sign-up/email \
  "{\"name\":\"Two Factor User\",\"email\":\"$email\",\"password\":\"$password\"}")"
echo "$signup"
user_id="$(printf '%s' "$signup" | json_field ".user.id")"

echo "== enable two-factor enrollment"
enabled="$(request_json "$primary_cookie" /api/auth/two-factor/enable \
  "{\"password\":\"$password\",\"issuer\":\"Team Starter\"}")"
echo "$enabled"
totp_uri="$(printf '%s' "$enabled" | json_field ".totpURI")"
backup_code="$(printf '%s' "$enabled" | json_field ".backupCodes[0]")"
backup_code_json="$(json_string "$backup_code")"
capture_data "$verify_dir/two-factor-after-enable.json" twoFactor --component betterAuth
capture_data "$verify_dir/users-after-enable.json" user --component betterAuth

echo "== verify enrollment with TOTP"
totp_code="$(totp_from_uri "$totp_uri")"
verified="$(request_json "$primary_cookie" /api/auth/two-factor/verify-totp \
  "{\"code\":\"$totp_code\"}")"
echo "$verified"
capture_data "$verify_dir/two-factor-after-verify.json" twoFactor --component betterAuth
capture_data "$verify_dir/users-after-verify.json" user --component betterAuth

echo "== sign-in requires second factor"
signin_gate="$(request_json "$challenge_cookie" /api/auth/sign-in/email \
  "{\"email\":\"$email\",\"password\":\"$password\"}")"
echo "$signin_gate"
assert_json "$signin_gate" "data.twoFactorRedirect === true && Array.isArray(data.twoFactorMethods) && data.twoFactorMethods.includes('totp') && data.token === undefined" \
  "sign-in should return only a two-factor challenge"

echo "== complete challenged sign-in with backup code"
backup_verified="$(request_json "$challenge_cookie" /api/auth/two-factor/verify-backup-code \
  "{\"code\":$backup_code_json}")"
echo "$backup_verified"
assert_json "$backup_verified" "typeof data.token === 'string' && data.user.twoFactorEnabled === true" \
  "backup-code verification should create a session"
capture_data "$verify_dir/two-factor-after-backup.json" twoFactor --component betterAuth

echo "== reused backup code is rejected"
signin_for_reuse="$(request_json "$reuse_cookie" /api/auth/sign-in/email \
  "{\"email\":\"$email\",\"password\":\"$password\"}")"
echo "$signin_for_reuse"
sleep 11
request_json_failure "$reuse_cookie" /api/auth/two-factor/verify-backup-code \
  "{\"code\":$backup_code_json}" \
  "INVALID_BACKUP_CODE"

echo "== disable two factor"
sleep 11
disabled="$(request_json "$challenge_cookie" /api/auth/two-factor/disable \
  "{\"password\":\"$password\"}")"
echo "$disabled"
capture_data "$verify_dir/two-factor-after-disable.json" twoFactor --component betterAuth
capture_data "$verify_dir/users-after-disable.json" user --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify two-factor state"
node - "$verify_dir" "$user_id" "$backup_code" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir, userId, backupCode] = process.argv.slice(2)

const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const afterEnableRows = parseTable('two-factor-after-enable.json')
const usersAfterEnable = parseTable('users-after-enable.json')
const afterVerifyRows = parseTable('two-factor-after-verify.json')
const usersAfterVerify = parseTable('users-after-verify.json')
const afterBackupRows = parseTable('two-factor-after-backup.json')
const afterDisableRows = parseTable('two-factor-after-disable.json')
const usersAfterDisable = parseTable('users-after-disable.json')
const appUsers = parseTable('app-users.json')

const rowAfterEnable = afterEnableRows.find((row) => row.userId === userId)
if (!rowAfterEnable) throw new Error('missing twoFactor row after enable')
if (rowAfterEnable.verified !== false) throw new Error('twoFactor row should be unverified after enable')
if (rowAfterEnable.backupCodes.includes(backupCode)) throw new Error('raw backup code leaked into component table')

const userAfterEnable = usersAfterEnable.find((row) => row._id === userId)
if (!userAfterEnable || userAfterEnable.twoFactorEnabled !== false) {
  throw new Error('user.twoFactorEnabled should be false before TOTP verification')
}

const rowAfterVerify = afterVerifyRows.find((row) => row.userId === userId)
if (!rowAfterVerify || rowAfterVerify.verified !== true) {
  throw new Error('twoFactor row should be verified after TOTP verification')
}
const userAfterVerify = usersAfterVerify.find((row) => row._id === userId)
if (!userAfterVerify || userAfterVerify.twoFactorEnabled !== true) {
  throw new Error('user.twoFactorEnabled should be true after TOTP verification')
}

const rowAfterBackup = afterBackupRows.find((row) => row.userId === userId)
if (!rowAfterBackup || rowAfterBackup.backupCodes === rowAfterVerify.backupCodes) {
  throw new Error('backup code verification should update stored backup codes')
}

if (afterDisableRows.length !== 0) throw new Error('twoFactor table should be empty after disable')
const userAfterDisable = usersAfterDisable.find((row) => row._id === userId)
if (!userAfterDisable || userAfterDisable.twoFactorEnabled !== false) {
  throw new Error('user.twoFactorEnabled should be false after disable')
}
if (!appUsers.some((row) => row.authUserId === userId)) {
  throw new Error('app user projection missing')
}
NODE

echo "better-auth two-factor feedback loop passed"
