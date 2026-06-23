#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 ||
  lsof -nP -iTCP:3210 -sTCP:LISTEN >/dev/null 2>&1 ||
  lsof -nP -iTCP:3211 -sTCP:LISTEN >/dev/null 2>&1; then
  printf 'ports 3000/3210/3211 must be free for the passkey browser probe\n' >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
convex_log="$tmpdir/convex-dev.log"
origin_log="$tmpdir/origin.log"
verify_dir="$tmpdir/tables"
convex_pid=""
origin_pid=""
mkdir -p "$verify_dir"

cleanup() {
  local status="$?"

  if [[ -n "$origin_pid" ]] && kill -0 "$origin_pid" >/dev/null 2>&1; then
    kill "$origin_pid" >/dev/null 2>&1 || true
    wait "$origin_pid" >/dev/null 2>&1 || true
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
    echo "== localhost origin log tail"
    tail -n 120 "$origin_log" 2>/dev/null || true
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

echo "== start localhost WebAuthn origin"
node --input-type=module >"$origin_log" 2>&1 <<'NODE' &
import http from 'node:http'

http
  .createServer(async (req, res) => {
    if (req.url?.startsWith('/api/auth')) {
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
        const upstream = await fetch(`http://127.0.0.1:3211${req.url}`, {
          method: req.method,
          headers: {
            ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
            ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
            origin: 'http://localhost:3000',
          },
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        })

        res.statusCode = upstream.status
        for (const [key, value] of upstream.headers.entries()) {
          if (
            key === 'content-encoding' ||
            key === 'content-length' ||
            key === 'transfer-encoding'
          ) {
            continue
          }
          if (key !== 'set-cookie') res.setHeader(key, value)
        }
        const setCookies =
          typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : []
        if (setCookies.length > 0) res.setHeader('set-cookie', setCookies)
        res.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        res.statusCode = 502
        res.end(String(error?.stack ?? error))
      }
      return
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>Better Auth Passkey Probe</title>')
  })
  .listen(3000, () => {
    console.log('passkey probe origin listening on http://localhost:3000')
  })
NODE
origin_pid="$!"
wait_for_ports "localhost WebAuthn origin" 3000

echo "== drive browser WebAuthn passkey registration and sign-in"
node --input-type=module <<'NODE'
import { chromium } from 'playwright'

const stamp = Date.now()
const email = `passkey-browser-${stamp}@example.com`
const password = 'password123'
const authBase = 'http://localhost:3000/api/auth'

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const cdp = await context.newCDPSession(page)

const toBase64Url = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const fromBase64Url = (value) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

try {
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })

  const result = await page.evaluate(
    async ({ authBase, email, password }) => {
      const request = async (path, init = {}) => {
        const response = await fetch(`${authBase}${path}`, {
          credentials: 'include',
          ...init,
          headers: {
            ...(init.body ? { 'content-type': 'application/json' } : {}),
            ...(init.headers ?? {}),
          },
        })
        const text = await response.text()
        const payload = text ? JSON.parse(text) : null
        if (!response.ok) {
          throw new Error(`${path} failed ${response.status}: ${text}`)
        }
        return payload
      }

      const fromBase64Url = (value) => {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
          Math.ceil(value.length / 4) * 4,
          '=',
        )
        const binary = atob(padded)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
      }

      const toBase64Url = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
      }

      const serializeRegistration = (credential) => ({
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        response: {
          clientDataJSON: toBase64Url(credential.response.clientDataJSON),
          attestationObject: toBase64Url(credential.response.attestationObject),
          transports:
            typeof credential.response.getTransports === 'function'
              ? credential.response.getTransports()
              : undefined,
        },
        clientExtensionResults: credential.getClientExtensionResults(),
      })

      const serializeAuthentication = (credential) => ({
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        response: {
          clientDataJSON: toBase64Url(credential.response.clientDataJSON),
          authenticatorData: toBase64Url(credential.response.authenticatorData),
          signature: toBase64Url(credential.response.signature),
          userHandle: credential.response.userHandle
            ? toBase64Url(credential.response.userHandle)
            : undefined,
        },
        clientExtensionResults: credential.getClientExtensionResults(),
      })

      const signup = await request('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Passkey Browser User',
          email,
          password,
        }),
      })

      const registrationOptions = await request(
        '/passkey/generate-register-options?name=Virtual%20Authenticator',
      )
      const publicKeyRegistration = {
        ...registrationOptions,
        challenge: fromBase64Url(registrationOptions.challenge),
        user: {
          ...registrationOptions.user,
          id: fromBase64Url(registrationOptions.user.id),
        },
        excludeCredentials: (registrationOptions.excludeCredentials ?? []).map((item) => ({
          ...item,
          id: fromBase64Url(item.id),
        })),
      }

      const registrationCredential = await navigator.credentials.create({
        publicKey: publicKeyRegistration,
      })
      if (!registrationCredential) throw new Error('navigator.credentials.create returned null')

      const registered = await request('/passkey/verify-registration', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Virtual Authenticator',
          response: serializeRegistration(registrationCredential),
        }),
      })

      const listed = await request('/passkey/list-user-passkeys')
      if (!Array.isArray(listed) || listed.length !== 1) {
        throw new Error(`expected one listed passkey, got ${JSON.stringify(listed)}`)
      }

      await request('/sign-out', { method: 'POST', body: JSON.stringify({}) })

      const authenticationOptions = await request('/passkey/generate-authenticate-options')
      const publicKeyAuthentication = {
        ...authenticationOptions,
        challenge: fromBase64Url(authenticationOptions.challenge),
        allowCredentials: (authenticationOptions.allowCredentials ?? []).map((item) => ({
          ...item,
          id: fromBase64Url(item.id),
        })),
      }

      const authenticationCredential = await navigator.credentials.get({
        publicKey: publicKeyAuthentication,
      })
      if (!authenticationCredential) throw new Error('navigator.credentials.get returned null')

      const signIn = await request('/passkey/verify-authentication', {
        method: 'POST',
        body: JSON.stringify({
          response: serializeAuthentication(authenticationCredential),
        }),
      })

      const session = await request('/get-session')

      return {
        email,
        userId: signup.user.id,
        registeredPasskeyId: registered.id,
        listedPasskeyId: listed[0]?.id,
        signInUserId: signIn.user.id,
        sessionUserId: session.user.id,
      }
    },
    { authBase, email, password },
  )

  console.log(JSON.stringify(result))
} finally {
  await browser.close()
}
NODE

echo "== inspect browser passkey rows"
capture_data "$verify_dir/better-auth-users.json" user --component betterAuth
capture_data "$verify_dir/better-auth-sessions.json" session --component betterAuth
capture_data "$verify_dir/better-auth-passkeys.json" passkey --component betterAuth
capture_data "$verify_dir/better-auth-verifications.json" verification --component betterAuth
capture_data "$verify_dir/app-users.json" users

echo "== verify browser passkey source-of-truth state"
node - "$verify_dir" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const [verifyDir] = process.argv.slice(2)
const parseTable = (filename) => {
  const raw = fs.readFileSync(path.join(verifyDir, filename), 'utf8')
  if (raw.trim() === '') return []
  if (raw.includes('There are no documents')) return []
  return JSON.parse(raw)
}

const users = parseTable('better-auth-users.json')
const sessions = parseTable('better-auth-sessions.json')
const passkeys = parseTable('better-auth-passkeys.json')
const verifications = parseTable('better-auth-verifications.json')
const appUsers = parseTable('app-users.json')

if (users.length !== 1) throw new Error(`expected one Better Auth user, got ${users.length}`)
if (sessions.length !== 1) throw new Error(`expected one signed-in session, got ${sessions.length}`)
if (passkeys.length !== 1) throw new Error(`expected one passkey row, got ${passkeys.length}`)
if (verifications.length !== 0) {
  throw new Error(`expected consumed WebAuthn challenges, got ${verifications.length}`)
}
if (passkeys[0]?.userId !== users[0]?._id) {
  throw new Error('passkey userId must point at Better Auth user id')
}
if (sessions[0]?.userId !== users[0]?._id) {
  throw new Error('session userId must point at Better Auth user id')
}
if (!appUsers.some((row) => row.authUserId === users[0]._id)) {
  throw new Error('missing app user projection for passkey user')
}
for (const field of ['publicKey', 'credentialID', 'counter', 'deviceType', 'backedUp']) {
  if (!Object.hasOwn(passkeys[0], field)) {
    throw new Error(`passkey row missing ${field}`)
  }
}
NODE

echo "== final hard reset"
pnpm experiment:hard-reset >/dev/null

echo "== final empty table inspection"
pnpm feedback:inspect

echo "better-auth passkey browser feedback loop passed"
