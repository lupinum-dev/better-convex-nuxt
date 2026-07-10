/**
 * PROOF FIXTURE — LIVE ISOLATION #3 (SAME-CLIENT A->B LEAK REPRODUCTION).
 *
 * On ONE reused ConvexClient, assert the leak EXISTS (this MOTIVATES the
 * retirement design — it is a demonstration of the failure, not a success):
 *   (a) Identity-blind query token: proofSupport.identityEcho{} serializes to
 *       the SAME query-token string under A and under B, so the client-local
 *       cache slot is shared. After setAuth(B), reading that same token slot
 *       still yields A's identity (stale A data visible while auth is B).
 *   (b) A-owned optimistic update kept in flight across setAuth(B) REMAINS
 *       visible and reapplies over B-era server results on the reused client.
 *
 * Port range 4600-4609. Uses port 4602.
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { convexToJson } from 'convex/values'

import { acquireToken, bootPlaygroundServer } from '../support/acquire-token.mjs'
import { convexUrl, makeSpyWebSocket, newWireRecord, sleep, waitUntil } from './support/ws-spy.mjs'

// Faithful inline copy of Convex 1.38's serializePathAndArgs
// (convex/dist/cjs/browser/sync/udf_path_utils.js): the query token is a pure
// function of (udfPath, args) with NO identity input — that is what makes it
// identity-blind. canonicalizeUdfPath("proofSupport:identityEcho") => same string.
function canonicalizeUdfPath(udfPath) {
  const pieces = udfPath.split(':')
  let moduleName
  let functionName
  if (pieces.length === 1) {
    moduleName = pieces[0]
    functionName = 'default'
  } else {
    moduleName = pieces.slice(0, pieces.length - 1).join(':')
    functionName = pieces[pieces.length - 1]
  }
  if (moduleName.endsWith('.js')) moduleName = moduleName.slice(0, -3)
  return `${moduleName}:${functionName}`
}
function serializePathAndArgs(udfPath, args) {
  return JSON.stringify({ udfPath: canonicalizeUdfPath(udfPath), args: convexToJson(args) })
}

const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter
const identityEcho = anyApi.proofSupport.identityEcho

async function main() {
  const url = convexUrl()
  const results = { assertions: [] }
  const assert = (name, pass, detail) => results.assertions.push({ name, pass, detail })

  const server = await bootPlaygroundServer({ port: 4602 })
  let client
  let heldMutation
  try {
    const userA = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
      name: 'Proof A',
    })
    const userB = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-b@example.test',
      password: 'Password123!',
      name: 'Proof B',
    })
    assert(
      'user A and B have distinct subjects',
      userA.userId && userB.userId && userA.userId !== userB.userId,
      `A=${userA.userId} B=${userB.userId}`,
    )

    const rec = newWireRecord()
    client = new ConvexClient(url, {
      unsavedChangesWarning: false,
      webSocketConstructor: makeSpyWebSocket(rec),
    })
    const base = client.client // BaseConvexClient, exposes localQueryResult / localQueryResultByToken

    // ---- authenticate A ----
    let aConfirmed = false
    client.setAuth(
      async () => userA.token,
      (isAuth) => {
        if (isAuth) aConfirmed = true
      },
    )
    await waitUntil(() => aConfirmed, { timeoutMs: 10000 })

    // ================= (a) IDENTITY-BLIND TOKEN =================
    // The query token computed by Convex for identityEcho{} is identity-blind.
    const echoTokenA = serializePathAndArgs('proofSupport:identityEcho', {})
    // Subscribe identityEcho so it lands in the local cache under A.
    let echoValA = undefined
    const unsubEcho = client.onUpdate(identityEcho, {}, (v) => {
      echoValA = v
    })
    await waitUntil(() => echoValA !== undefined && echoValA !== null)
    const localUnderA = base.localQueryResultByToken(echoTokenA)
    assert(
      'identityEcho cached under A resolves to A subject',
      localUnderA && localUnderA.subject === userA.userId,
      `local=${localUnderA && localUnderA.subject}`,
    )

    // Switch identity to B on the SAME client. Deliberately NOT awaited:
    // the proof observes the cache slot mid-transition.
    client.setAuth(
      async () => userB.token,
      () => {},
    )

    // The token STRING is identical for B (identity-blind): recompute and compare.
    const echoTokenB = serializePathAndArgs('proofSupport:identityEcho', {})
    assert(
      'identityEcho query token is byte-identical under A and B (identity-blind)',
      echoTokenA === echoTokenB,
      `equal=${echoTokenA === echoTokenB}`,
    )

    // Immediately after setAuth(B) — before B's server transition overwrites —
    // the SAME local cache slot still holds A's identity: stale A data visible under B.
    const localSlotRightAfterSwitch = base.localQueryResultByToken(echoTokenA)
    assert(
      'LEAK: shared cache slot still yields A identity right after setAuth(B)',
      localSlotRightAfterSwitch && localSlotRightAfterSwitch.subject === userA.userId,
      `slot=${localSlotRightAfterSwitch && localSlotRightAfterSwitch.subject} (A=${userA.userId})`,
    )
    unsubEcho()

    // ================= (b) OPTIMISTIC UPDATE LEAK ACROSS setAuth =================
    // Re-authenticate A cleanly for the optimistic scenario on the same reused client.
    let aConfirmed2 = false
    client.setAuth(
      async () => userA.token,
      (isAuth) => {
        if (isAuth) aConfirmed2 = true
      },
    )
    await waitUntil(() => aConfirmed2, { timeoutMs: 10000 })

    const key = `leak-${Date.now()}`
    const timeline = []
    const unsubCounter = client.onUpdate(getCounter, { key }, (v) => {
      timeline.push({ at: Date.now(), v })
    })
    await waitUntil(() => timeline.length >= 1) // initial value 0
    const baseValue = timeline[timeline.length - 1].v

    const OPT = 1000
    // Start an optimistic mutation and HOLD the promise (do not await).
    heldMutation = client
      .mutation(
        incrementCounter,
        { key },
        {
          optimisticUpdate: (store) => {
            const cur = store.getQuery(getCounter, { key }) ?? 0
            store.setQuery(getCounter, { key }, cur + OPT)
          },
        },
      )
      .catch(() => {}) // guard against unhandled rejection if the client is retired

    // Optimistic update applied synchronously at call time:
    const optimisticNow = base.localQueryResult('proofSupport:getCounter', { key })
    assert(
      'A-era optimistic update applied synchronously',
      optimisticNow === baseValue + OPT,
      `local=${optimisticNow} expected=${baseValue + OPT}`,
    )

    // Switch to B while the A-owned optimistic mutation is still in flight.
    // Deliberately NOT awaited: the proof observes optimistic state mid-transition.
    client.setAuth(
      async () => userB.token,
      () => {},
    )

    // Immediately after setAuth(B): A-era optimistic value REMAINS visible.
    const optimisticAfterSwitch = base.localQueryResult('proofSupport:getCounter', { key })
    assert(
      'LEAK: A-era optimistic value remains visible on the reused client right after setAuth(B)',
      optimisticAfterSwitch === baseValue + OPT,
      `local=${optimisticAfterSwitch} expected=${baseValue + OPT}`,
    )

    // Observe reapplication over B-era server results: value carrying the +1000
    // A-era optimistic delta appears in the delivered timeline AFTER the switch.
    const switchAt = Date.now()
    await waitUntil(() => timeline.some((e) => e.at >= switchAt && e.v >= baseValue + OPT), {
      timeoutMs: 4000,
    })
    const reappliedAfterSwitch = timeline.filter((e) => e.at >= switchAt && e.v >= baseValue + OPT)
    assert(
      'LEAK: A-owned optimistic delta reapplies over B-era server result(s)',
      reappliedAfterSwitch.length >= 1,
      `post-switch high values=${JSON.stringify(reappliedAfterSwitch.map((e) => e.v))}`,
    )

    unsubCounter()
    results.counts = {
      baseValue,
      optimisticDelta: OPT,
      deliveredTimelineValues: timeline.map((e) => e.v),
    }
  } finally {
    // In-flight mutation promise may hang after switch — guard with a timeout.
    if (heldMutation) await Promise.race([heldMutation, sleep(1500)])
    if (client) await Promise.race([client.close(), sleep(2000)]).catch(() => {})
    await server.release()
  }
  return results
}

main()
  .then((r) => {
    const failed = r.assertions.filter((a) => !a.pass)
    console.log(
      JSON.stringify(
        {
          proof: 'same-client-leak',
          verdict: failed.length === 0 ? 'PASS (leak reproduced)' : 'FAIL',
          ...r,
        },
        null,
        2,
      ),
    )
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.log(
      JSON.stringify(
        { proof: 'same-client-leak', verdict: 'ERROR', error: String((e && e.stack) || e) },
        null,
        2,
      ),
    )
    process.exit(2)
  })
