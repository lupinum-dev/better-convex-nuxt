/**
 * Proof harness token acquisition helper (vNext Phase 0).
 *
 * Boots the playground Nuxt server (which mounts this module's own
 * `/api/auth/*` proxy routes — the same code path `client-engine.ts` drives
 * in the browser) on a caller-specified port, signs a deterministic test
 * user up (or in, if it already exists), fetches a Convex JWT from
 * `GET /api/auth/convex/token`, and returns `{ token, userId }`.
 *
 * IMPORTANT (environment-specific): `nuxi dev` was tried first and rejected.
 * In this sandbox, Nuxt 4.4.7's dev SSR pipeline (Nitro 2.13.4 + vite-node)
 * talks to its dev bundler over a Unix domain socket under a `TMPDIR` path,
 * and every request fails with `connect EINVAL <socket path>` — the dev
 * server never serves a single request (reproduced standalone, unrelated to
 * this helper). A production build + Nitro `node-server` preview is fully
 * reliable here and is what's used below. The build is a one-time,
 * process-wide singleton shared by every port/group; only the lightweight
 * `node .output/server/index.mjs` process is spawned per port.
 *
 * Designed for reuse across the parallel proof groups: servers are cached
 * per-port (module-level singleton, ref-counted) so a group can acquire many
 * tokens (user A, user B, re-acquire A) against one booted server and
 * `release()` once at teardown. Each proof group MUST use its own port (see
 * proofs-harness.md for the assigned ranges) so parallel vitest workers never
 * collide on the same server process.
 *
 * Requires a reachable Convex dev backend (see ensureLocalConvex in
 * test/helpers/local-convex.ts) — this helper does not start Convex itself.
 */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const playgroundCwd = fileURLToPath(new URL('../../../playground/', import.meta.url))
const outputServerEntry = path.join(playgroundCwd, '.output/server/index.mjs')

/** @type {Map<number, { child: import('node:child_process').ChildProcess, baseUrl: string, refs: number, ready: Promise<void> }>} */
const servers = new Map()

/** Process-wide singleton: build the playground once, share across every port. */
let buildPromise = null

async function ensureBuilt({ cwd, force = false }) {
  if (!force && existsSync(outputServerEntry)) return
  if (!buildPromise) {
    buildPromise = new Promise((resolve, reject) => {
      const build = spawn('npx', ['nuxi', 'build'], { cwd, stdio: 'pipe' })
      const chunks = []
      build.stdout.on('data', (d) => chunks.push(d.toString()))
      build.stderr.on('data', (d) => chunks.push(d.toString()))
      build.once('exit', (code) => {
        if (code === 0) resolve()
        else
          reject(
            new Error(
              `[acquireToken] \`nuxi build\` failed (exit ${code}):\n${chunks.join('').slice(-4000)}`,
            ),
          )
      })
      build.once('error', reject)
    })
  }
  await buildPromise
}

function waitForPort(port, timeoutMs) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      const fail = () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for playground Nuxt server on port ${port}`))
          return
        }
        setTimeout(attempt, 150)
      }
      socket.once('timeout', fail)
      socket.once('error', fail)
      socket.connect(port, '127.0.0.1')
    }
    attempt()
  })
}

async function waitForHttpReady(baseUrl, timeoutMs) {
  const started = Date.now()
  // Nuxt dev cold start (Vite SSR bundle compile) commonly takes 3-12s locally.
  // Poll the root route until it serves *something* (any status = server is up).
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(baseUrl, { redirect: 'manual' })
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for ${baseUrl} to serve HTTP after ${timeoutMs}ms`)
}

function readEnvFile(cwd) {
  const values = {}
  try {
    const content = readFileSync(path.join(cwd, '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [rawKey, ...rest] = trimmed.split('=')
      if (!rawKey || rest.length === 0) continue
      const value = rest.join('=').trim().split('#')[0]?.trim()
      if (value) values[rawKey.trim()] = value
    }
  } catch {
    // no .env.local — rely on process.env
  }
  return values
}

/**
 * Boot (or reuse) the playground server on `port` (production build served
 * via Nitro's `node-server` preset — see the module comment for why `nuxi
 * dev` is not used here). Returns a handle with `baseUrl` and `release()`.
 * Ref-counted: the underlying process is only killed when the last caller
 * releases it.
 */
export async function bootPlaygroundServer({
  port,
  cwd = playgroundCwd,
  env = {},
  timeoutMs = 60_000,
} = {}) {
  if (!port)
    throw new Error(
      'bootPlaygroundServer requires an explicit port (see proofs-harness.md port ranges)',
    )

  const baseUrl = `http://127.0.0.1:${port}`
  let entry = servers.get(port)

  if (!entry) {
    await ensureBuilt({ cwd })

    const envFile = readEnvFile(cwd)
    const convexUrl = env.CONVEX_URL ?? process.env.CONVEX_URL ?? envFile.CONVEX_URL
    const convexSiteUrl =
      env.CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL ?? envFile.CONVEX_SITE_URL

    const child = spawn('node', [outputServerEntry], {
      cwd,
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
        HOST: '127.0.0.1',
        // Nitro's `node-server` preset is already built; runtime config
        // overrides for nested `public.convex.*` keys need the NUXT_PUBLIC_
        // prefix (standard Nuxt runtimeConfig env override), not the bare
        // CONVEX_URL/CONVEX_SITE_URL names read at build/module-setup time.
        ...(convexUrl ? { NUXT_PUBLIC_CONVEX_URL: convexUrl, CONVEX_URL: convexUrl } : {}),
        ...(convexSiteUrl
          ? { NUXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl, CONVEX_SITE_URL: convexSiteUrl }
          : {}),
      },
      stdio: 'pipe',
    })

    const chunks = []
    const append = (data) => {
      chunks.push(data.toString())
      if (chunks.length > 500) chunks.shift()
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)

    const ready = (async () => {
      await Promise.race([
        waitForPort(port, timeoutMs),
        once(child, 'exit').then(([code, signal]) => {
          throw new Error(
            `Playground server exited before opening port ${port} (code=${code} signal=${signal}).\n${chunks.join('')}`,
          )
        }),
      ])
      await waitForHttpReady(baseUrl, timeoutMs)
    })()

    entry = { child, baseUrl, refs: 0, ready }
    servers.set(port, entry)
  }

  entry.refs += 1
  try {
    await entry.ready
  } catch (error) {
    entry.refs -= 1
    throw error
  }

  return {
    baseUrl: entry.baseUrl,
    release: async () => {
      entry.refs -= 1
      if (entry.refs > 0) return
      servers.delete(port)
      entry.child.kill('SIGTERM')
      const timer = setTimeout(() => {
        if (!entry.child.killed) entry.child.kill('SIGKILL')
      }, 3000)
      await once(entry.child, 'exit').catch(() => {})
      clearTimeout(timer)
    },
  }
}

function decodeJwtSubject(token) {
  const parts = token.split('.')
  if (parts.length < 2) return null
  const payloadJson = Buffer.from(
    parts[1].replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf-8')
  const payload = JSON.parse(payloadJson)
  return payload.sub ?? payload.authId ?? null
}

function extractSessionCookie(setCookieHeaders) {
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';')
    if (
      pair.startsWith('better-auth.session_token=') ||
      pair.startsWith('__Secure-better-auth.session_token=')
    ) {
      return pair.trim()
    }
  }
  return null
}

/**
 * Sign up (or, if the account already exists, sign in) a deterministic test
 * user against the booted playground server's own auth proxy routes, then
 * fetch a fresh Convex JWT via GET /api/auth/convex/token.
 *
 * Returns `{ token, userId }`. `userId` is the Better Auth user id (JWT
 * `sub` claim == `identity.subject` seen by Convex functions).
 */
export async function acquireToken({ baseUrl, email, password, name = 'Proof User' }) {
  const origin = baseUrl
  const commonHeaders = {
    'content-type': 'application/json',
    origin,
  }

  let signUpRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({ email, password, name }),
  })

  let sessionCookie = extractSessionCookie(signUpRes.headers.getSetCookie?.() ?? [])

  if (!sessionCookie) {
    // Account likely already exists (re-acquiring a token for the same user,
    // or a previous run left the user behind) — fall back to sign-in.
    const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({ email, password }),
    })
    sessionCookie = extractSessionCookie(signInRes.headers.getSetCookie?.() ?? [])

    if (!sessionCookie) {
      const body = await signInRes.text().catch(() => '')
      throw new Error(
        `[acquireToken] Could not establish a session for ${email} via sign-up or sign-in ` +
          `(sign-up status=${signUpRes.status}, sign-in status=${signInRes.status}). Body: ${body.slice(0, 300)}`,
      )
    }
  }

  const tokenRes = await fetch(`${baseUrl}/api/auth/convex/token`, {
    method: 'GET',
    headers: { origin, cookie: sessionCookie },
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '')
    throw new Error(
      `[acquireToken] GET /api/auth/convex/token failed (${tokenRes.status}): ${body.slice(0, 300)}`,
    )
  }

  const data = await tokenRes.json()
  const token = data?.token
  if (!token || typeof token !== 'string') {
    throw new Error(
      `[acquireToken] Response from /api/auth/convex/token had no token: ${JSON.stringify(data)}`,
    )
  }

  const userId = decodeJwtSubject(token)
  return { token, userId, sessionCookie }
}

/**
 * Re-acquire a fresh token for an already-signed-up user (token rotation
 * scenarios). Same as `acquireToken` but skips the sign-up attempt.
 */
export async function reacquireToken({ baseUrl, sessionCookie, email, password }) {
  const origin = baseUrl
  let cookie = sessionCookie

  if (!cookie) {
    const signInRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, password }),
    })
    cookie = extractSessionCookie(signInRes.headers.getSetCookie?.() ?? [])
    if (!cookie) throw new Error(`[reacquireToken] Could not sign in ${email} to rotate token`)
  }

  const tokenRes = await fetch(`${baseUrl}/api/auth/convex/token`, {
    method: 'GET',
    headers: { origin, cookie },
  })
  if (!tokenRes.ok) {
    throw new Error(`[reacquireToken] GET /api/auth/convex/token failed (${tokenRes.status})`)
  }
  const data = await tokenRes.json()
  const token = data?.token
  const userId = decodeJwtSubject(token)
  return { token, userId, sessionCookie: cookie }
}
