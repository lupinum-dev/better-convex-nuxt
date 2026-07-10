/**
 * PROOF 8 — EPOCH-SCOPED REFRESH DEDUP (vNext §5.8 proof 8 / §5.3).
 *
 * Decision (verbatim, §5.3): "Refresh deduplication is authEpoch-scoped;
 * sign-out/revocation take their epoch at queue-dequeue, not invocation."
 * Also §5.3: "Refresh results may mutate token/... only when their captured
 * authEpoch remains current." and "Each [identity op] increments authEpoch
 * when it begins executing — before performing its effect or awaiting Better
 * Auth."
 *
 * Prototype: a client authed as A. A deliberately-slow background refresh
 * (wrapped token fetcher) is in flight; it captured authEpoch at dequeue. A
 * completing sign-in as B advances authEpoch and synchronizes with Convex WITHOUT
 * awaiting the stale refresh. When the stale refresh finally resolves, its
 * captured epoch is stale, so it CANNOT commit (result discarded). Final
 * identity is the sign-in's (B).
 */
import { ConvexClient } from 'convex/browser'

function confirmOnClient(client, token, api, expectedSubject, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('confirm timeout')), timeoutMs)
    let settled = false
    client.setAuth(
      async () => token,
      (isAuth) => {
        if (isAuth && !settled) {
          settled = true
          clearTimeout(timer)
          client.query(api.identityEcho, {}).then((id) => {
            if (id?.subject !== expectedSubject)
              reject(new Error(`subject ${id?.subject} != ${expectedSubject}`))
            else resolve(id)
          }, reject)
        }
      },
    )
  })
}

export async function run({ convexUrl, api, tokens }) {
  const log = []
  const client = new ConvexClient(convexUrl, { unsavedChangesWarning: false })

  // authEpoch state (per §5.3 "every auth engine owns two monotonically
  // increasing counters; authEpoch invalidates stale auth-operation work").
  let authEpoch = 0

  // 1. Initial identity: authed as A under epoch 0.
  await confirmOnClient(client, tokens.A.token, api, tokens.A.userId)
  log.push('initial identity = A (epoch 0)')

  const t0 = Date.now()
  let refreshResolvedAt = null
  let refreshCommitted = false
  let refreshDiscarded = false

  // 2. Kick off a deliberately-slow BACKGROUND REFRESH. It is separately
  //    deduplicated per authEpoch; it captures the epoch AT DEQUEUE.
  const refreshCapturedEpoch = authEpoch // dequeue happens now → capture 0
  const slowRefresh = (async () => {
    // Wrapped token fetcher: deliberately slow (2s). Resolves to an A-token
    // (so if it wrongly committed, identity would revert to A, making the
    // discard observable).
    await new Promise((r) => setTimeout(r, 2000))
    const refreshedToken = tokens.Afresh.token
    refreshResolvedAt = Date.now() - t0
    // COMMIT GUARD: may only mutate transport if captured epoch is still current.
    if (refreshCapturedEpoch === authEpoch) {
      refreshCommitted = true
      client.setAuth(
        async () => refreshedToken,
        () => {},
      )
    } else {
      refreshDiscarded = true // stale → discarded, never touches transport
    }
  })()

  // 3. A completing SIGN-IN as B. It is an identity-queue op: increments
  //    authEpoch when it BEGINS EXECUTING (before its effect), and does NOT
  //    await the in-flight background refresh.
  authEpoch += 1 // now 1
  const signInEpoch = authEpoch
  await confirmOnClient(client, tokens.B.token, api, tokens.B.userId)
  const signInCompletedAt = Date.now() - t0
  log.push(
    `sign-in B confirmed at +${signInCompletedAt}ms under epoch ${signInEpoch} (did NOT await refresh)`,
  )

  const signInCompletedBeforeRefreshResolved = refreshResolvedAt === null

  // 4. Now wait for the stale refresh to finish and attempt its (guarded) commit.
  await slowRefresh
  log.push(
    `stale refresh resolved at +${refreshResolvedAt}ms; captured epoch ${refreshCapturedEpoch} vs current ${authEpoch}; committed=${refreshCommitted} discarded=${refreshDiscarded}`,
  )

  // 5. Final identity must be the sign-in's (B), proving the refresh's A-token
  //    result was discarded.
  const finalId = await client.query(api.identityEcho, {})
  await client.close()

  const pass =
    signInCompletedBeforeRefreshResolved && // sign-in did not await the 2s refresh
    refreshCommitted === false &&
    refreshDiscarded === true &&
    finalId?.subject === tokens.B.userId

  return {
    proof: 'proof8-epoch-refresh-dedup',
    pass,
    signInCompletedAtMs: signInCompletedAt,
    refreshResolvedAtMs: refreshResolvedAt,
    signInCompletedBeforeRefreshResolved,
    refreshCapturedEpoch,
    finalEpoch: authEpoch,
    refreshCommitted,
    refreshDiscarded,
    finalSubject: finalId?.subject,
    expectedFinalSubject: tokens.B.userId,
    refreshWouldHaveSetSubject: tokens.Afresh.userId,
    log,
  }
}
