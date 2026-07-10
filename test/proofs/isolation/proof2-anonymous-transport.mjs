/**
 * PROOF FIXTURE — LIVE ISOLATION #2 (ANONYMOUS `none` TRANSPORT, vNext §5.8 proof 2).
 *
 * While client A (authenticated) holds an ACTIVE subscription, a SEPARATE
 * anonymous ConvexClient runs proofSupport.identityEcho and receives `null`,
 * and A's subscription is undisturbed (callback count unaffected, still live).
 * Also confirms the anonymous client's WebSocket connects AT CONSTRUCTION
 * (before any query is issued) — the motivation for lazy instantiation.
 *
 * Port range 4600-4609 (isolation group). Uses port 4601.
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { acquireToken, bootPlaygroundServer } from '../support/acquire-token.mjs'
import { convexUrl, makeSpyWebSocket, newWireRecord, sleep, waitUntil } from './support/ws-spy.mjs'

const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter
const identityEcho = anyApi.proofSupport.identityEcho

async function main() {
  const url = convexUrl()
  const results = { assertions: [] }
  const assert = (name, pass, detail) => results.assertions.push({ name, pass, detail })

  const server = await bootPlaygroundServer({ port: 4601 })
  let clientA, anon
  try {
    const userA = await acquireToken({
      baseUrl: server.baseUrl,
      email: 'proof-a@example.test',
      password: 'Password123!',
      name: 'Proof A',
    })

    // --- authenticated client A with an active subscription ---
    const recA = newWireRecord()
    clientA = new ConvexClient(url, {
      unsavedChangesWarning: false,
      webSocketConstructor: makeSpyWebSocket(recA),
    })
    let aAuthConfirmed = false
    clientA.setAuth(
      async () => userA.token,
      (isAuth) => {
        if (isAuth) aAuthConfirmed = true
      },
    )
    await waitUntil(() => aAuthConfirmed, { timeoutMs: 10000 })
    assert(
      'client A reached confirmed-auth (onChange true)',
      aAuthConfirmed,
      `confirmed=${aAuthConfirmed}`,
    )

    const key = `anon-${Date.now()}`
    let aCbCount = 0
    const aValues = []
    const unsubA = clientA.onUpdate(getCounter, { key }, (v) => {
      aCbCount += 1
      aValues.push(v)
    })
    await waitUntil(() => aCbCount >= 1)

    // Confirm A's identity via a one-shot authenticated query.
    const aIdentity = await clientA.query(identityEcho, {})
    assert(
      'client A identityEcho == user A subject',
      aIdentity && aIdentity.subject === userA.userId,
      `subject=${aIdentity && aIdentity.subject} expected=${userA.userId}`,
    )

    // --- SEPARATE anonymous client: WebSocket connects at construction ---
    const recAnon = newWireRecord()
    anon = new ConvexClient(url, {
      unsavedChangesWarning: false,
      webSocketConstructor: makeSpyWebSocket(recAnon),
    })
    // Synchronously (no query issued yet) the WS constructor already ran:
    const constructCountAtBirth = recAnon.constructCount
    assert(
      'anonymous client constructs WebSocket eagerly (before any query)',
      constructCountAtBirth >= 1,
      `constructCount=${constructCountAtBirth}, out-frames-so-far=${recAnon.out.length}`,
    )
    const anonOpened = await waitUntil(() => recAnon.opened, { timeoutMs: 10000 })
    assert(
      'anonymous client WebSocket opened without any query issued',
      anonOpened,
      `opened=${recAnon.opened} openedAt=${recAnon.openedAt}`,
    )

    // --- anonymous identityEcho => null; A undisturbed ---
    const aCbBeforeAnon = aCbCount
    const anonIdentity = await anon.query(identityEcho, {})
    assert(
      'anonymous client identityEcho === null',
      anonIdentity === null,
      `anonIdentity=${JSON.stringify(anonIdentity)}`,
    )
    await sleep(500)
    assert(
      "A's subscription callback count unaffected by anon activity",
      aCbCount === aCbBeforeAnon,
      `aCbCount ${aCbBeforeAnon}->${aCbCount}`,
    )

    // A subscription still live: mutate and observe A deliver.
    const aCbBeforeMut = aCbCount
    const v1 = await clientA.mutation(incrementCounter, { key })
    await waitUntil(() => aCbCount > aCbBeforeMut)
    assert(
      "A's subscription still delivers after anon ran",
      aCbCount > aCbBeforeMut && aValues[aValues.length - 1] === v1,
      `delivered=${aValues[aValues.length - 1]} server=${v1}`,
    )

    // Anon re-check still null after A mutated.
    const anonIdentity2 = await anon.query(identityEcho, {})
    assert(
      'anonymous client remains null after A mutation',
      anonIdentity2 === null,
      `anonIdentity2=${JSON.stringify(anonIdentity2)}`,
    )

    unsubA()
    results.counts = {
      aSubscriptionCallbacks: aCbCount,
      anonConstructCountAtBirth: constructCountAtBirth,
      anonQueriesRun: 2,
    }
  } finally {
    if (clientA) await clientA.close().catch(() => {})
    if (anon) await anon.close().catch(() => {})
    await server.release()
  }
  return results
}

main()
  .then((r) => {
    const failed = r.assertions.filter((a) => !a.pass)
    console.log(
      JSON.stringify(
        { proof: 'anonymous-transport', verdict: failed.length === 0 ? 'PASS' : 'FAIL', ...r },
        null,
        2,
      ),
    )
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.log(
      JSON.stringify(
        { proof: 'anonymous-transport', verdict: 'ERROR', error: String((e && e.stack) || e) },
        null,
        2,
      ),
    )
    process.exit(2)
  })
