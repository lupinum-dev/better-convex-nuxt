#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 ||
  lsof -nP -iTCP:3210 -sTCP:LISTEN >/dev/null 2>&1 ||
  lsof -nP -iTCP:3211 -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'ports 3000/3210/3211 must be free for the UI cutover probe\n' >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
convex_log="$tmpdir/convex-dev.log"
nuxt_log="$tmpdir/nuxt-dev.log"
verify_dir="$tmpdir/tables"
convex_pid=""
nuxt_pid=""
mkdir -p "$verify_dir"

cleanup() {
  local status="$?"

  if [[ -n "$nuxt_pid" ]] && kill -0 "$nuxt_pid" >/dev/null 2>&1; then
    kill "$nuxt_pid" >/dev/null 2>&1 || true
    wait "$nuxt_pid" >/dev/null 2>&1 || true
  fi

  if [[ -n "$convex_pid" ]] && kill -0 "$convex_pid" >/dev/null 2>&1; then
    kill "$convex_pid" >/dev/null 2>&1 || true
    wait "$convex_pid" >/dev/null 2>&1 || true
  fi

  if [[ "$status" != "0" ]]; then
    echo
    echo "== convex dev log tail"
    tail -n 120 "$convex_log" 2>/dev/null || true
    echo
    echo "== nuxt dev log tail"
    tail -n 120 "$nuxt_log" 2>/dev/null || true
  fi

  rm -rf "$tmpdir"
}
trap cleanup EXIT

port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_ports() {
  local label="$1"
  shift
  local deadline="$((SECONDS + 120))"

  while ((SECONDS < deadline)); do
    local ready="true"
    for port in "$@"; do
      if ! port_listening "$port"; then
        ready="false"
      fi
    done

    if [[ "$ready" == "true" ]]; then
      return 0
    fi

    sleep 1
  done

  printf 'timed out waiting for %s\n' "$label" >&2
  return 1
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

echo "== start local Convex"
pnpm convex:dev >"$convex_log" 2>&1 &
convex_pid="$!"
wait_for_ports "local Convex ports 3210 and 3211" 3210 3211

echo "== initial hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== start Nuxt dev server"
pnpm dev --host 127.0.0.1 --port 3000 >"$nuxt_log" 2>&1 &
nuxt_pid="$!"
wait_for_ports "Nuxt port 3000" 3000

echo "== drive starter UI through Better Auth organization cutover"
node --input-type=module <<'NODE'
import { chromium } from 'playwright'

const stamp = Date.now()
const email = `ui-cutover-${stamp}@example.com`
const password = 'password123'
const orgName = `UI Cutover Org ${stamp}`
const projectName = `UI Cutover Project ${stamp}`

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' })

  await page.getByLabel('Name').fill('UI Cutover User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.getByPlaceholder('Organization name').waitFor({ timeout: 20000 })
  await page.getByPlaceholder('Organization name').fill(orgName)
  await page.getByRole('button', { name: 'Create' }).click()

  const orgLink = page.getByRole('link', { name: new RegExp(orgName) })
  await orgLink.waitFor({ timeout: 20000 })
  await orgLink.click()

  await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 20000 })
  await page.getByPlaceholder('Project name').fill(projectName)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByText(projectName).waitFor({ timeout: 20000 })

  await page.getByRole('link', { name: 'Organizations' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByText('Signed out').waitFor({ timeout: 20000 })

  if (await page.getByText(orgName).count()) {
    throw new Error('organization remained visible after sign-out')
  }

  console.log(JSON.stringify({ email, orgName, projectName }))
} finally {
  await browser.close()
}
NODE

echo "== inspect browser-created source-of-truth rows"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-organizations.json" organization --component betterAuth
capture_data "$verify_dir/better-auth-members.json" member --component betterAuth
capture_data "$verify_dir/projects.json" projects
capture_data "$verify_dir/audit-events.json" auditEvents

echo "== verify browser cutover source-of-truth state"
node - "$verify_dir" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir] = process.argv.slice(2)
const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.includes('There are no documents')) return []
  if (raw.trim().length === 0) return []
  return JSON.parse(raw)
}

const users = parseTable('better-auth-users.json')
const organizations = parseTable('better-auth-organizations.json')
const members = parseTable('better-auth-members.json')
const projects = parseTable('projects.json')
const auditEvents = parseTable('audit-events.json')

if (users.length !== 1) throw new Error(`expected 1 Better Auth user, got ${users.length}`)
if (organizations.length !== 1) {
  throw new Error(`expected 1 Better Auth organization, got ${organizations.length}`)
}
if (members.length !== 1 || members[0]?.role !== 'owner') {
  throw new Error(`expected one owner member, got ${JSON.stringify(members)}`)
}
if (projects.length !== 1) throw new Error(`expected 1 product project, got ${projects.length}`)
if (auditEvents.length !== 1) {
  throw new Error(`expected 1 product audit event, got ${auditEvents.length}`)
}
if (projects[0]?.organizationId !== organizations[0]?._id) {
  throw new Error('project organizationId must point at Better Auth organization id')
}
if (projects[0]?.createdByAuthUserId !== users[0]?._id) {
  throw new Error('project actor must point at Better Auth user id')
}
if (auditEvents[0]?.resourceId !== projects[0]?._id) {
  throw new Error('audit event must point at product project id')
}
NODE

echo "== final hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== final empty table inspection"
pnpm feedback:inspect

echo "starter UI Better Auth cutover feedback loop passed"
