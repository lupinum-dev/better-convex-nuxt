#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

server_pid=""
started_server="false"
tmpdir="$(mktemp -d)"
server_log="$tmpdir/convex-dev.log"

cleanup() {
  local status="$?"

  if [[ "$started_server" == "true" && -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$status" != "0" && -f "$server_log" ]]; then
    echo
    echo "== convex dev log tail"
    tail -n 120 "$server_log" || true
  fi

  rm -rf "$tmpdir"
}
trap cleanup EXIT

port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_local_convex() {
  local deadline="$((SECONDS + 90))"

  while ((SECONDS < deadline)); do
    if [[ "$started_server" == "true" ]] && ! kill -0 "$server_pid" >/dev/null 2>&1; then
      echo "convex dev exited before becoming ready" >&2
      return 1
    fi

    if port_listening 3210 && port_listening 3211; then
      return 0
    fi

    sleep 1
  done

  echo "timed out waiting for local Convex ports 3210 and 3211" >&2
  return 1
}

run_step() {
  local label="$1"
  shift

  echo
  echo "== $label"
  "$@"
}

if port_listening 3210 || port_listening 3211; then
  if ! port_listening 3210 || ! port_listening 3211; then
    echo "expected both local Convex ports 3210 and 3211 to be free or both to be listening" >&2
    exit 1
  fi

  echo "== using existing local Convex server on ports 3210 and 3211"
else
  echo "== starting local Convex server"
  pnpm convex:dev >"$server_log" 2>&1 &
  server_pid="$!"
  started_server="true"
fi

wait_for_local_convex

run_step "initial hard reset" pnpm experiment:hard-reset
run_step "agent feedback probes" pnpm feedback:agent
run_step "final hard reset" pnpm experiment:hard-reset
run_step "final empty table inspection" pnpm feedback:inspect

echo
echo "local baseline feedback loop passed"
