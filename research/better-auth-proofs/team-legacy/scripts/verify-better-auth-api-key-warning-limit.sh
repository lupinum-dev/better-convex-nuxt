#!/usr/bin/env bash
set -euo pipefail

if lsof -nP -iTCP:3210 -sTCP:LISTEN >/dev/null 2>&1 || lsof -nP -iTCP:3211 -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'ports 3210/3211 are already in use; stop the running Convex dev server before this probe\n' >&2
  exit 1
fi

stamp="$(date +%s)"
password="password123"
email="apikey-warning-$stamp@example.com"
cookie_jar="$(mktemp)"
log_file="$(mktemp)"
server_pid=""
trap 'rm -f "$cookie_jar" "$log_file"; if [[ -n "$server_pid" ]] && kill -0 "$server_pid" >/dev/null 2>&1; then kill "$server_pid" >/dev/null 2>&1 || true; wait "$server_pid" >/dev/null 2>&1 || true; fi' EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1)))"
}

request_json() {
  local path="$1"
  local body="$2"
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
  local path="$1"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -G "http://127.0.0.1:3211$path" \
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

wait_for_convex() {
  local waited=0
  while ((waited < 60)); do
    if grep -q 'Convex functions ready' "$log_file"; then
      return 0
    fi
    if [[ -n "$server_pid" ]] && ! kill -0 "$server_pid" >/dev/null 2>&1; then
      printf 'Convex dev exited before becoming ready\n' >&2
      cat "$log_file" >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
  printf 'timed out waiting for Convex functions ready\n' >&2
  cat "$log_file" >&2
  exit 1
}

echo "== start isolated Convex dev server"
pnpm convex:dev >"$log_file" 2>&1 &
server_pid="$!"
wait_for_convex

echo "== hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== create, list, and delete a user API key"
signup="$(request_json /api/auth/sign-up/email \
  "{\"name\":\"API Key Warning\",\"email\":\"$email\",\"password\":\"$password\"}")"
echo "$signup"

created_key="$(request_json /api/auth/api-key/create \
  "{\"configId\":\"user-keys\",\"name\":\"Warning key\",\"prefix\":\"usr\"}")"
echo "$created_key"
api_key_id="$(printf '%s' "$created_key" | json_field ".id")"

listed_keys="$(request_json_get "/api/auth/api-key/list?configId=user-keys")"
echo "$listed_keys"

deleted_key="$(request_json /api/auth/api-key/delete \
  "{\"configId\":\"user-keys\",\"keyId\":\"$api_key_id\"}")"
echo "$deleted_key"

sleep 1

echo "== verify current API-key warning limit"
warning_count="$(grep -c 'unawaited operation' "$log_file" || true)"
if ((warning_count < 1)); then
  printf 'expected current @better-auth/api-key management routes to log the Convex unawaited-operation warning, but none was observed\n' >&2
  printf 'This likely means upstream behavior changed; re-evaluate the production-readiness note.\n' >&2
  cat "$log_file" >&2
  exit 1
fi

grep 'unawaited operation' "$log_file"
printf 'observed_unawaited_operation_warnings=%s\n' "$warning_count"

echo "== final hard reset"
pnpm experiment:hard-reset >/dev/null

echo "better-auth API key warning expected-limit probe passed"
