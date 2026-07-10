/**
 * PROOF FIXTURE — LIVE ISOLATION #4 (REPLACEMENT-PRIMARY ISOLATION).
 *
 * The retirement design: close A's client (accepting that in-flight mutation
 * promises HANG — guarded with our own timeout), construct a FRESH client for
 * B, and assert:
 *   - the A-era in-flight mutation promise does NOT settle after close();
 *   - ZERO A-era data / optimistic state is observable on B's fresh client;
 *   - B's queries return B-scoped results (identityEcho == B);
 *   - the separate anonymous client is unchanged (still null, undisturbed).
 *
 * Plus QUANTIFICATION of the beforeunload accumulation: across repeated
 * construct/close cycles, count 'beforeunload' listener registrations vs
 * removals. Method: an instrumented global.window.addEventListener /
 * removeEventListener (Node has no window) — Convex adds one 'beforeunload'
 * listener per client when unsavedChangesWarning !== false and NEVER removes
 * it on close(), while it DOES remove its 'online' listener on close.
 *
 * Port range 4600-4609. Uses port 4603.
 */
import { ConvexClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { acquireToken, bootPlaygroundServer } from '../support/acquire-token.mjs'
import { convexUrl, makeSpyWebSocket, newWireRecord, sleep, waitUntil } from './support/ws-spy.mjs'

const getCounter = anyApi.proofSupport.getCounter
const incrementCounter = anyApi.proofSupport.incrementCounter
const identityEcho = anyApi.proofSupport.identityEcho

async function isolationPart(url, server, assert, results) {
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

  // --- separate anonymous client, established up front ---
  const recAnon = newWireRecord()
  const anon = new ConvexClient(url, {
    unsavedChangesWarning: false,
    webSocketConstructor: makeSpyWebSocket(recAnon),
  })
  const anonBefore = await anon.query(identityEcho, {})
  assert(
    'anonymous client identity is null before retirement',
    anonBefore === null,
    `anonBefore=${JSON.stringify(anonBefore)}`,
  )

  const key = `repl-${Date.now()}`
  const OPT = 777

  // --- client A: authenticate, subscribe, start in-flight optimistic mutation ---
  const recA = newWireRecord()
  const clientA = new ConvexClient(url, {
    unsavedChangesWarning: false,
    webSocketConstructor: makeSpyWebSocket(recA),
  })
  let aConfirmed = false
  clientA.setAuth(
    async () => userA.token,
    (isAuth) => {
      if (isAuth) aConfirmed = true
    },
  )
  await waitUntil(() => aConfirmed, { timeoutMs: 10000 })

  let aCb = 0
  const unsubA = clientA.onUpdate(getCounter, { key }, () => {
    aCb += 1
  })
  await waitUntil(() => aCb >= 1)

  let mutationSettled = false
  const heldMutation = clientA
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
    .then(
      () => {
        mutationSettled = true
      },
      () => {
        mutationSettled = true
      },
    )

  // Optimistic A value is live on clientA right now.
  const aOptimistic = clientA.client.localQueryResult('proofSupport:getCounter', { key })
  assert(
    'A-era optimistic value present on A before close',
    aOptimistic === OPT,
    `aOptimistic=${aOptimistic}`,
  )

  // --- RETIRE A: close the client. In-flight mutation promise hangs. ---
  unsubA()
  await clientA.close()
  await sleep(1200) // give the (doomed) promise ample time to settle if it were going to
  assert(
    'in-flight mutation promise HANGS after close() (never settles)',
    mutationSettled === false,
    `mutationSettled=${mutationSettled}`,
  )

  // --- FRESH client B ---
  const recB = newWireRecord()
  const clientB = new ConvexClient(url, {
    unsavedChangesWarning: false,
    webSocketConstructor: makeSpyWebSocket(recB),
  })
  const baseB = clientB.client
  let bConfirmed = false
  clientB.setAuth(
    async () => userB.token,
    (isAuth) => {
      if (isAuth) bConfirmed = true
    },
  )
  await waitUntil(() => bConfirmed, { timeoutMs: 10000 })

  // Zero A-era optimistic/data observable on B (brand-new client, empty store).
  const bLocalCounterBeforeRun = baseB.localQueryResult('proofSupport:getCounter', { key })
  assert(
    'B fresh client has no A-era optimistic getCounter value',
    bLocalCounterBeforeRun === undefined || bLocalCounterBeforeRun < OPT,
    `bLocalCounter=${JSON.stringify(bLocalCounterBeforeRun)}`,
  )

  // B queries return B-scoped results.
  const bIdentity = await clientB.query(identityEcho, {})
  assert(
    'B fresh client identityEcho == user B subject',
    bIdentity && bIdentity.subject === userB.userId,
    `subject=${bIdentity && bIdentity.subject} expected=${userB.userId}`,
  )
  assert(
    'B identity is NOT user A (no cross-user leak)',
    !bIdentity || bIdentity.subject !== userA.userId,
    `subject=${bIdentity && bIdentity.subject} A=${userA.userId}`,
  )

  // B's live getCounter reflects the true server counter, with no +777 A optimistic.
  let bCounterVal
  const unsubB = clientB.onUpdate(getCounter, { key }, (v) => {
    bCounterVal = v
  })
  await waitUntil(() => bCounterVal !== undefined)
  assert(
    'B getCounter carries NO A-era optimistic delta',
    bCounterVal < OPT,
    `bCounterVal=${bCounterVal} (optDelta=${OPT})`,
  )

  // Anonymous client unchanged.
  const anonAfter = await anon.query(identityEcho, {})
  assert(
    'anonymous client identity still null after retirement + B creation',
    anonAfter === null,
    `anonAfter=${JSON.stringify(anonAfter)}`,
  )

  unsubB()
  results.isolationCounts = { aOptimistic, bCounterVal, mutationSettledAfterClose: mutationSettled }

  // Best-effort cleanup; the hung promise is intentionally abandoned.
  await Promise.race([clientB.close(), sleep(1500)]).catch(() => {})
  await Promise.race([anon.close(), sleep(1500)]).catch(() => {})
  void heldMutation // intentionally not awaited (it hangs)
}

async function beforeunloadCountPart(url, assert, results) {
  // Instrument a minimal fake window BEFORE constructing clients so Convex's
  // beforeunload registration path (unsavedChangesWarning !== false) executes.
  const addLog = []
  const removeLog = []
  const priorWindow = globalThis.window
  globalThis.window = {
    addEventListener: (type) => addLog.push(type),
    removeEventListener: (type) => removeLog.push(type),
    event: undefined,
  }
  const CYCLES = 3
  try {
    for (let i = 0; i < CYCLES; i++) {
      // NOTE: unsavedChangesWarning intentionally left at default (browser-like)
      // so the beforeunload listener is registered.
      const rec = newWireRecord()
      const c = new ConvexClient(url, { webSocketConstructor: makeSpyWebSocket(rec) })
      await sleep(150)
      await c.close()
      await sleep(50)
    }
  } finally {
    if (priorWindow === undefined) delete globalThis.window
    else globalThis.window = priorWindow
  }
  const beforeunloadAdds = addLog.filter((t) => t === 'beforeunload').length
  const beforeunloadRemoves = removeLog.filter((t) => t === 'beforeunload').length
  const onlineAdds = addLog.filter((t) => t === 'online').length
  const onlineRemoves = removeLog.filter((t) => t === 'online').length

  assert(
    `beforeunload listeners accumulate one-per-client across ${CYCLES} construct/close cycles`,
    beforeunloadAdds === CYCLES,
    `adds=${beforeunloadAdds} cycles=${CYCLES}`,
  )
  assert(
    'close() removes ZERO beforeunload listeners (accumulation leak)',
    beforeunloadRemoves === 0,
    `removes=${beforeunloadRemoves}`,
  )
  // Contrast: the 'online' listener IS removed on close — isolates that the
  // beforeunload non-removal is a specific defect, not a general no-cleanup.
  assert(
    'contrast: online listener IS removed on close (cleanup exists, just not for beforeunload)',
    onlineRemoves === onlineAdds && onlineAdds >= 1,
    `onlineAdds=${onlineAdds} onlineRemoves=${onlineRemoves}`,
  )

  results.beforeunloadCounts = {
    method: 'instrumented global.window.addEventListener/removeEventListener (Node has no window)',
    cycles: CYCLES,
    beforeunloadAdds,
    beforeunloadRemoves,
    onlineAdds,
    onlineRemoves,
    netLeakedBeforeunloadListeners: beforeunloadAdds - beforeunloadRemoves,
  }
}

async function main() {
  const url = convexUrl()
  const results = { assertions: [] }
  const assert = (name, pass, detail) => results.assertions.push({ name, pass, detail })

  const server = await bootPlaygroundServer({ port: 4603 })
  try {
    await isolationPart(url, server, assert, results)
    await beforeunloadCountPart(url, assert, results)
  } finally {
    await server.release()
  }
  return results
}

main()
  .then((r) => {
    const failed = r.assertions.filter((a) => !a.pass)
    console.log(
      JSON.stringify(
        { proof: 'replacement-isolation', verdict: failed.length === 0 ? 'PASS' : 'FAIL', ...r },
        null,
        2,
      ),
    )
    process.exit(failed.length === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.log(
      JSON.stringify(
        { proof: 'replacement-isolation', verdict: 'ERROR', error: String((e && e.stack) || e) },
        null,
        2,
      ),
    )
    process.exit(2)
  })
