#!/usr/bin/env node
/**
 * Deterministic stub-upstream benchmark for the SSR auth cache
 * (vNext §9 / internal §10.4).
 *
 * Compares Convex token EXCHANGE COUNT and LATENCY across N cookie-bearing
 * server calls with the cache disabled vs. enabled, against a local stub
 * HTTP server standing in for the Better Auth `/api/auth/convex/token`
 * endpoint (an artificial per-request latency models real network cost).
 * Offline and deterministic: no live Convex/Better Auth deployment, no
 * credentials, no Nitro runtime — this is a plain Node script run directly
 * against the REAL published `exchangeConvexToken` primitive from a built
 * `dist/`.
 *
 * The cache-enabled path reimplements exactly the effective-TTL algorithm the
 * real caller uses (vNext §9 step 8; internal §10.4): a fresh exchange is
 * cached for `min(configured cache TTL, remaining JWT lifetime from `exp`)`,
 * and a cached token already at/after its `exp` is never served. THIS
 * min(TTL, JWT exp) bound is the accepted worst-case sign-out revocation
 * window documented below — a token revoked at Better Auth immediately after
 * being cached here can still be served by `serverConvex` for up to that long
 * (bounded further by the explicit `serverConvexClearAuthCache` invalidation
 * hook and the sign-out proxy that calls it).
 *
 * Run:
 *   pnpm exec nuxt-module-build build   (or: pnpm run prepack)
 *   node scripts/benchmark-server-auth-cache.mjs
 */

import { existsSync } from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const distTokenExchange = `${repoRoot}dist/runtime/server/utils/token-exchange.js`
const distConvexShared = `${repoRoot}dist/runtime/utils/convex-shared.js`

if (!existsSync(distTokenExchange) || !existsSync(distConvexShared)) {
  console.error(
    'benchmark-server-auth-cache requires a built dist/. Run `pnpm exec nuxt-module-build build` first.',
  )
  process.exit(1)
}

const { exchangeConvexToken } = await import(distTokenExchange)
const { getJwtTimeUntilExpiryMs } = await import(distConvexShared)

// ---------------------------------------------------------------------------
// Stub upstream: models the Better Auth `/api/auth/convex/token` endpoint
// with a fixed artificial network latency and a JWT whose `exp` is far in
// the future (so this benchmark measures cache/exchange behavior, not
// expiry-driven eviction — that invariant is covered by
// test/unit/server-convex-caller.test.ts).
// ---------------------------------------------------------------------------

const UPSTREAM_LATENCY_MS = 15

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function makeJwt(expSeconds) {
  return `${base64url({ alg: 'none' })}.${base64url({ exp: expSeconds })}.sig`
}

let exchangeCount = 0

function startStubUpstream(token) {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/auth/convex/token')) {
      exchangeCount += 1
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ token }))
      }, UPSTREAM_LATENCY_MS)
      return
    }
    res.writeHead(404).end()
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// ---------------------------------------------------------------------------
// The exact effective-TTL algorithm `serverConvex`'s cookie resolution uses
// (vNext §9 step 8), reimplemented here over a plain in-memory Map so this
// benchmark stays offline and independent of the Nitro storage runtime that
// backs the real `getCachedAuthToken`/`setCachedAuthToken`
// (src/runtime/server/utils/auth-cache.ts) — the algorithm under test is
// identical, only the storage backend differs.
// ---------------------------------------------------------------------------

function effectiveCacheTtlSeconds(configuredTtlSeconds, token) {
  const untilExpiryMs = getJwtTimeUntilExpiryMs(token)
  if (untilExpiryMs === null) return configuredTtlSeconds
  return Math.min(configuredTtlSeconds, Math.floor(untilExpiryMs / 1000))
}

function isCachedTokenUsable(token) {
  const untilExpiryMs = getJwtTimeUntilExpiryMs(token)
  return untilExpiryMs === null || untilExpiryMs > 0
}

function makeMapCache() {
  const store = new Map() // sessionToken -> { token, expiresAtMs }
  return {
    async get(sessionToken) {
      const entry = store.get(sessionToken)
      if (!entry) return null
      if (Date.now() >= entry.expiresAtMs) {
        store.delete(sessionToken)
        return null
      }
      return isCachedTokenUsable(entry.token) ? entry.token : null
    },
    async set(sessionToken, token, ttlSeconds) {
      if (ttlSeconds <= 0) return
      store.set(sessionToken, { token, expiresAtMs: Date.now() + ttlSeconds * 1000 })
    },
  }
}

async function resolveTokenCacheDisabled(siteUrl, sessionCookie) {
  const result = await exchangeConvexToken({
    siteUrl,
    credential: { type: 'cookie', value: sessionCookie },
  })
  return result.token
}

async function resolveTokenCacheEnabled(
  siteUrl,
  sessionCookie,
  sessionKey,
  cache,
  configuredTtlSeconds,
) {
  const cached = await cache.get(sessionKey)
  if (cached) return cached
  const result = await exchangeConvexToken({
    siteUrl,
    credential: { type: 'cookie', value: sessionCookie },
  })
  if (result.token) {
    const ttl = effectiveCacheTtlSeconds(configuredTtlSeconds, result.token)
    await cache.set(sessionKey, result.token, ttl)
  }
  return result.token
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

const CALL_COUNT = 50
const CONFIGURED_CACHE_TTL_SECONDS = 300

async function benchmarkDisabled(siteUrl, sessionCookie) {
  exchangeCount = 0
  const start = performance.now()
  for (let i = 0; i < CALL_COUNT; i++) {
    await resolveTokenCacheDisabled(siteUrl, sessionCookie)
  }
  const elapsedMs = performance.now() - start
  return { exchangeCount, elapsedMs }
}

async function benchmarkEnabled(siteUrl, sessionCookie) {
  exchangeCount = 0
  const cache = makeMapCache()
  const start = performance.now()
  for (let i = 0; i < CALL_COUNT; i++) {
    await resolveTokenCacheEnabled(
      siteUrl,
      sessionCookie,
      sessionCookie,
      cache,
      CONFIGURED_CACHE_TTL_SECONDS,
    )
  }
  const elapsedMs = performance.now() - start
  return { exchangeCount, elapsedMs }
}

async function main() {
  const token = makeJwt(Math.floor(Date.now() / 1000) + 3600) // exp far in the future
  const server = await startStubUpstream(token)
  const address = server.address()
  const siteUrl = `http://127.0.0.1:${address.port}`
  const sessionCookie = 'better-auth.session_token=benchmark-session; Path=/'

  try {
    const disabled = await benchmarkDisabled(siteUrl, sessionCookie)
    const enabled = await benchmarkEnabled(siteUrl, sessionCookie)

    console.log(`Server auth-cache benchmark (${CALL_COUNT} cookie-bearing calls, one session)`)
    console.log(`Stub upstream latency per exchange: ${UPSTREAM_LATENCY_MS}ms`)
    console.log('')
    console.log('cache: disabled')
    console.log(`  exchange count: ${disabled.exchangeCount} (expected: ${CALL_COUNT})`)
    console.log(`  total latency:  ${disabled.elapsedMs.toFixed(1)}ms`)
    console.log('')
    console.log('cache: enabled')
    console.log(`  exchange count: ${enabled.exchangeCount} (expected: 1)`)
    console.log(`  total latency:  ${enabled.elapsedMs.toFixed(1)}ms`)
    console.log('')
    console.log(
      `Accepted revocation window with the cache enabled: min(configured cache TTL, remaining JWT ` +
        `lifetime from 'exp') — here min(${CONFIGURED_CACHE_TTL_SECONDS}s, ~3600s) = ${CONFIGURED_CACHE_TTL_SECONDS}s. ` +
        `A shorter-lived JWT tightens this automatically; explicit ` +
        `serverConvexClearAuthCache (wired to the sign-out proxy) closes the window immediately.`,
    )

    if (disabled.exchangeCount !== CALL_COUNT) {
      console.error(
        `Expected ${CALL_COUNT} exchanges with the cache disabled, got ${disabled.exchangeCount}`,
      )
      process.exitCode = 1
    }
    if (enabled.exchangeCount !== 1) {
      console.error(
        `Expected exactly 1 exchange with the cache enabled, got ${enabled.exchangeCount}`,
      )
      process.exitCode = 1
    }
    if (enabled.elapsedMs >= disabled.elapsedMs) {
      console.error('Expected the cache-enabled run to be faster than the cache-disabled run')
      process.exitCode = 1
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

await main()
