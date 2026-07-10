/**
 * TOTAL TOKEN FETCHER + TRANSIENT RETRY (internal §20 total-token-fetcher /
 * transient-retry fixtures; supports vNext §5.3 refresh contract).
 *
 * (a) Reproduce the unhandled rejection from a REJECTING token fetcher (the
 *     re-verified claim: a fetcher that throws surfaces as an unhandled
 *     rejection) — demonstrate once.
 * (b) Prove a TOTAL (never-throwing) token fetcher is required and sufficient:
 *     wrap with a fetcher that returns null on failure + bounded retry with
 *     JWT-exp validation (the decodeJwtPayload approach; mirrors
 *     src/runtime/utils/convex-shared.ts decodeJwtPayload/getJwtTimeUntilExpiryMs).
 *     Assert: no unhandled rejections across induced failures, bounded attempt
 *     counts, and eventual recovery on success.
 */
import { ConvexClient } from 'convex/browser'

// Mirror of src/runtime/utils/convex-shared.ts decodeJwtPayload (no verification).
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf-8',
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}
function jwtExpIsValid(token, nowMs = Date.now()) {
  const p = decodeJwtPayload(token)
  if (!p) return false
  const exp = p.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false
  return exp * 1000 > nowMs
}

/**
 * TOTAL token fetcher: never throws. Retries a transient source up to
 * maxAttempts, validates JWT exp, returns null (not throw) on exhaustion.
 *
 * Note: the Convex client itself may INVOKE fetchToken more than once
 * (initial + forceRefreshToken). Each invocation runs its own bounded retry
 * loop, so we record per-invocation attempt counts to assert boundedness.
 */
function makeTotalFetcher({ source, maxAttempts, stats }) {
  return async () => {
    stats.invocations += 1
    let attemptsThisInvocation = 0
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsThisInvocation += 1
      stats.totalAttempts += 1
      try {
        const token = await source(attempt)
        if (!token) continue
        if (!jwtExpIsValid(token)) continue
        stats.perInvocationAttempts.push(attemptsThisInvocation)
        return token // valid → done
      } catch {
        // total fetcher swallows transient errors; loops to retry
      }
    }
    stats.perInvocationAttempts.push(attemptsThisInvocation)
    return null // exhausted → null signals "no token", NEVER throws
  }
}
const newStats = () => ({ invocations: 0, totalAttempts: 0, perInvocationAttempts: [] })

function collectUnhandled(durationMs) {
  const seen = []
  const handler = (reason) => seen.push(reason)
  process.on('unhandledRejection', handler)
  return {
    done: async () => {
      await new Promise((r) => setTimeout(r, durationMs))
      // Force any pending microtask/GC-driven reports to flush.
      if (global.gc) global.gc()
      await new Promise((r) => setTimeout(r, 50))
      process.off('unhandledRejection', handler)
      return seen
    },
  }
}

// ---- (a) Rejecting fetcher → unhandled rejection (demonstrate once) ----
async function partA({ convexUrl }) {
  const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
  const collector = collectUnhandled(1200)
  let rejectingCalled = false
  client.setAuth(
    async () => {
      rejectingCalled = true
      throw new Error('PROOF-rejecting-token-fetcher') // NON-total fetcher: throws
    },
    () => {},
  )
  const unhandled = await collector.done()
  await client.close()
  const matched = unhandled.filter(
    (r) => r instanceof Error && String(r.message).includes('PROOF-rejecting-token-fetcher'),
  )
  return {
    rejectingCalled,
    unhandledCount: matched.length,
    reproducedUnhandledRejection: matched.length >= 1,
  }
}

// ---- (b) Total fetcher: bounded retry + recovery, no unhandled rejections ----
async function partB({ convexUrl, api, tokens }) {
  const maxAttempts = 4

  // Scenario 1: source throws twice, then returns a valid token → recovery.
  const collector1 = collectUnhandled(600)
  const stats1 = newStats()
  const client1 = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
  const source1 = async (attempt) => {
    if (attempt <= 2) throw new Error('transient failure')
    return tokens.A.token // valid on attempt 3
  }
  let confirmed1 = false
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('recovery timeout')), 8000)
    client1.setAuth(makeTotalFetcher({ source: source1, maxAttempts, stats: stats1 }), (isAuth) => {
      if (isAuth && !confirmed1) {
        confirmed1 = true
        clearTimeout(timer)
        resolve()
      }
    })
  })
  const identity1 = await client1.query(api.identityEcho, {})
  const unhandled1 = await collector1.done()
  await client1.close()

  // Scenario 2: source ALWAYS fails → total fetcher returns null after
  // maxAttempts; no unhandled rejection; bounded attempts; stays unauthed.
  const collector2 = collectUnhandled(800)
  const stats2 = newStats()
  const client2 = new ConvexClient(convexUrl, { unsavedChangesWarning: false })
  const source2 = async () => {
    throw new Error('always fails')
  }
  let sawAuthTrue2 = false
  client2.setAuth(makeTotalFetcher({ source: source2, maxAttempts, stats: stats2 }), (isAuth) => {
    if (isAuth) sawAuthTrue2 = true
  })
  const unhandled2 = await collector2.done()
  await client2.close()

  const maxPer = (arr) => (arr.length ? Math.max(...arr) : 0)
  return {
    maxAttempts,
    scenario1: {
      recovered: confirmed1,
      confirmedSubject: identity1?.subject,
      expectedSubject: tokens.A.userId,
      fetcherInvocations: stats1.invocations,
      perInvocationAttempts: stats1.perInvocationAttempts, // each expected 3 (fail,fail,success)
      maxAttemptsPerInvocation: maxPer(stats1.perInvocationAttempts),
      unhandledRejections: unhandled1.length,
    },
    scenario2: {
      stayedUnauthed: sawAuthTrue2 === false,
      fetcherInvocations: stats2.invocations,
      perInvocationAttempts: stats2.perInvocationAttempts, // each bounded at maxAttempts
      maxAttemptsPerInvocation: maxPer(stats2.perInvocationAttempts),
      unhandledRejections: unhandled2.length,
    },
  }
}

export async function run({ convexUrl, api, tokens }) {
  const a = await partA({ convexUrl })
  const b = await partB({ convexUrl, api, tokens })

  const pass =
    a.reproducedUnhandledRejection === true &&
    b.scenario1.recovered === true &&
    b.scenario1.confirmedSubject === b.scenario1.expectedSubject &&
    b.scenario1.maxAttemptsPerInvocation === 3 && // fail, fail, success
    b.scenario1.perInvocationAttempts.every((n) => n <= b.maxAttempts) &&
    b.scenario1.unhandledRejections === 0 &&
    b.scenario2.stayedUnauthed === true &&
    b.scenario2.fetcherInvocations >= 1 &&
    b.scenario2.maxAttemptsPerInvocation === b.maxAttempts && // exhausts bound
    b.scenario2.perInvocationAttempts.every((n) => n <= b.maxAttempts) &&
    b.scenario2.unhandledRejections === 0

  return {
    proof: 'proof-total-fetcher-retry',
    pass,
    rejectingFetcher: a,
    totalFetcher: b,
  }
}
